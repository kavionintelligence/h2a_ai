import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Text } from 'pixi.js';
import type { AgentRuntimeSummary } from '@h2a/contracts';
import { OfficeCamera, type OfficeCameraSnapshot } from './OfficeCamera';
import { findOfficePath } from './pathfinding';
import { installOfficeContextRecovery, shouldRunSceneTicker, type ContextRecoveryController } from './sceneLifecycle';
import type { OfficeSceneModel } from './sceneModel';
import { visualStateForEntity, visualTarget, type OfficeVisualState } from './officeVisualState';
import {
  OFFICE_GRID_HEIGHT,
  OFFICE_GRID_WIDTH,
  OFFICE_TILE_SIZE,
  isOfficeTileWalkable,
  officePalette,
  officeSpawn,
  officeStations,
  officeZones,
  tileToWorld,
  type OfficePoint,
  type OfficeStation
} from './officeTheme';

export interface OfficeSceneStats {
  renderState: 'initializing' | 'ready' | 'recovering' | 'failed';
  tickerState: 'running' | 'idle';
  camera: OfficeCameraSnapshot;
  characterCount: number;
  recoveryAttempts: number;
}

interface CharacterRuntime {
  agent: AgentRuntimeSummary;
  view: Container;
  path: OfficePoint[];
  pathIndex: number;
  visual: OfficeVisualState;
  signal: Container;
}

interface OfficeSceneEngineOptions {
  host: HTMLElement;
  model: OfficeSceneModel;
  reducedMotion: boolean;
  onAgentActivate(agentId: string): void;
  onStats(stats: OfficeSceneStats): void;
  onRecoveryRequired(attempt: number): void;
  onFailure(message: string): void;
}

const WORLD_WIDTH = OFFICE_GRID_WIDTH * OFFICE_TILE_SIZE;
const WORLD_HEIGHT = OFFICE_GRID_HEIGHT * OFFICE_TILE_SIZE;
const CHARACTER_SPEED = 118;

export class OfficeSceneEngine {
  private app?: Application;
  private world?: Container;
  private characterLayer?: Container;
  private signalLayer?: Container;
  private camera?: OfficeCamera;
  private characters: CharacterRuntime[] = [];
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private recovery?: ContextRecoveryController;
  private disposed = false;
  private intersecting = true;
  private documentVisible = document.visibilityState !== 'hidden';
  private tickerState: OfficeSceneStats['tickerState'] = 'idle';
  private recoveryAttempts = 0;
  private drag?: { x: number; y: number };
  private signalTime = 0;

  public constructor(private readonly options: OfficeSceneEngineOptions) {}

  public async mount(): Promise<void> {
    this.emitStats('initializing');
    const application = new Application();
    this.app = application;
    try {
      await application.init({
        width: Math.max(1, this.options.host.clientWidth),
        height: Math.max(1, this.options.host.clientHeight),
        background: officePalette.void,
        antialias: false,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: 'webgl',
        roundPixels: true
      });
      if (this.disposed) return this.destroyApplication(application);

      application.canvas.className = 'pixel-office-canvas';
      application.canvas.setAttribute('aria-hidden', 'true');
      application.canvas.dataset.renderState = 'ready';
      this.options.host.replaceChildren(application.canvas);

      this.world = new Container();
      this.characterLayer = new Container();
      this.signalLayer = new Container();
      application.stage.addChild(this.world);
      this.drawOfficeMap(this.world);
      this.world.addChild(this.signalLayer);
      this.world.addChild(this.characterLayer);

      this.camera = new OfficeCamera(this.world, WORLD_WIDTH, WORLD_HEIGHT);
      this.camera.resize(application.screen.width, application.screen.height);
      this.updateModel(this.options.model);
      this.installInteraction(application.canvas);
      this.installLifecycle(application.canvas);
      application.ticker.add(this.onTick);
      application.render();
      this.updateCanvasData('ready');
      this.applyTickerPolicy();
      this.emitStats('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The pixel office could not initialize.';
      this.updateCanvasData('failed');
      this.options.onFailure(message);
      this.emitStats('failed');
    }
  }

  public updateModel(model: OfficeSceneModel): void {
    if (!this.characterLayer || !this.signalLayer || !this.app) return;
    const previousPositions = new Map(this.characters.map((runtime) => [runtime.agent.id, { x: runtime.view.x, y: runtime.view.y }]));
    this.characterLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.signalLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.characters = model.agents.map(({ agent, station, officeEntity }) => this.createCharacter(agent, station, visualStateForEntity(officeEntity), previousPositions.get(agent.id)));
    for (const runtime of this.characters) this.characterLayer.addChild(runtime.view);
    this.drawCanonicalSignals(model);
    this.app.render();
    this.updateCanvasData('ready');
    this.applyTickerPolicy();
    this.emitStats('ready');
  }

  public zoomIn(): void {
    this.camera?.zoomBy(1.2);
    this.renderAfterCameraChange();
  }

  public zoomOut(): void {
    this.camera?.zoomBy(1 / 1.2);
    this.renderAfterCameraChange();
  }

  public panBy(x: number, y: number): void {
    this.camera?.panBy(x, y);
    this.renderAfterCameraChange();
  }

  public resetCamera(): void {
    this.camera?.reset();
    this.renderAfterCameraChange();
  }

  public destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    this.recovery?.dispose();
    if (this.app) this.destroyApplication(this.app);
    this.characters = [];
    this.options.host.replaceChildren();
  }

  private drawOfficeMap(world: Container): void {
    const floor = new Graphics();
    floor.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).fill(officePalette.wall);
    for (let y = 1; y < OFFICE_GRID_HEIGHT - 1; y += 1) {
      for (let x = 1; x < OFFICE_GRID_WIDTH - 1; x += 1) {
        const color = (x + y) % 2 === 0 ? officePalette.floorA : officePalette.floorB;
        floor.rect(x * OFFICE_TILE_SIZE, y * OFFICE_TILE_SIZE, OFFICE_TILE_SIZE, OFFICE_TILE_SIZE)
          .fill(color)
          .stroke({ color: officePalette.floorLine, width: 1 });
      }
    }
    floor.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT).stroke({ color: officePalette.wallEdge, width: 6 });
    world.addChild(floor);

    for (const zone of officeZones) {
      const zoneGraphic = new Graphics();
      zoneGraphic.rect(zone.x * OFFICE_TILE_SIZE, zone.y * OFFICE_TILE_SIZE, zone.width * OFFICE_TILE_SIZE, zone.height * OFFICE_TILE_SIZE)
        .stroke({ color: zone.accent, width: 3 });
      zoneGraphic.rect(zone.x * OFFICE_TILE_SIZE + 7, zone.y * OFFICE_TILE_SIZE + 7, 8, 8).fill(zone.accent);
      world.addChild(zoneGraphic);
      const label = this.makeLabel(zone.label.toUpperCase(), zone.x * OFFICE_TILE_SIZE + 20, zone.y * OFFICE_TILE_SIZE + 5, 10, officePalette.ink);
      world.addChild(label);
    }

    const agentCarpet = new Graphics();
    agentCarpet.roundRect(10 * OFFICE_TILE_SIZE, 2 * OFFICE_TILE_SIZE, 11 * OFFICE_TILE_SIZE, 9 * OFFICE_TILE_SIZE, 4)
      .fill(officePalette.carpet)
      .stroke({ color: officePalette.carpetEdge, width: 2 });
    world.addChild(agentCarpet);

    for (const station of officeStations) this.drawStation(world, station);
    this.drawDecor(world);
  }

  private drawStation(world: Container, station: OfficeStation): void {
    const x = station.desk.x * OFFICE_TILE_SIZE;
    const y = station.desk.y * OFFICE_TILE_SIZE;
    const desk = new Graphics();
    desk.rect(x - 10, y - 7, 52, 25).fill(officePalette.desk).stroke({ color: officePalette.deskEdge, width: 3 });
    desk.rect(x + 7, y - 16, 24, 14).fill(officePalette.screen).stroke({ color: station.accent, width: 2 });
    desk.rect(x + 13, y - 12, 12, 6).fill(station.accent);
    desk.rect(x + 17, y - 2, 4, 8).fill(officePalette.deskEdge);
    world.addChild(desk);
    world.addChild(this.makeLabel(station.label, x - 9, y + 20, 9, officePalette.white));
  }

  private drawDecor(world: Container): void {
    const decor = new Graphics();
    decor.rect(3 * OFFICE_TILE_SIZE, 8 * OFFICE_TILE_SIZE, 4 * OFFICE_TILE_SIZE, 2 * OFFICE_TILE_SIZE)
      .fill(0xe8edef).stroke({ color: officePalette.wallEdge, width: 2 });
    decor.rect(24 * OFFICE_TILE_SIZE, 15 * OFFICE_TILE_SIZE, 4 * OFFICE_TILE_SIZE, 2 * OFFICE_TILE_SIZE)
      .fill(0xe8edef).stroke({ color: officePalette.wallEdge, width: 2 });
    for (const point of [{ x: 2, y: 12 }, { x: 27, y: 12 }, { x: 8, y: 17 }, { x: 21, y: 17 }]) {
      const x = point.x * OFFICE_TILE_SIZE;
      const y = point.y * OFFICE_TILE_SIZE;
      decor.rect(x + 9, y + 18, 14, 10).fill(officePalette.desk);
      decor.rect(x + 13, y + 3, 6, 18).fill(officePalette.plant);
      decor.rect(x + 4, y + 6, 12, 7).fill(officePalette.plantLight);
      decor.rect(x + 17, y, 11, 8).fill(officePalette.plantLight);
    }
    world.addChild(decor);
  }

  private createCharacter(agent: AgentRuntimeSummary, station: OfficeStation, visual: OfficeVisualState, previous?: OfficePoint): CharacterRuntime {
    const view = new Container();
    const body = new Graphics();
    const accent = Number.parseInt(agent.accent.slice(1), 16);
    body.rect(-7, -20, 14, 8).fill(0xe7b995).stroke({ color: officePalette.ink, width: 2 });
    body.rect(-9, -12, 18, 15).fill(accent).stroke({ color: officePalette.ink, width: 2 });
    body.rect(-9, 3, 7, 9).fill(0x273746);
    body.rect(2, 3, 7, 9).fill(0x273746);
    body.rect(-8, -17, 16, 4).fill(officePalette.ink);
    view.addChild(body);
    const initials = this.makeLabel(agent.initials, -10, -35, 8, officePalette.white);
    initials.style.align = 'center';
    view.addChild(initials);
    const signal = this.createStatusSignal(visual);
    view.addChild(signal);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.on('pointertap', () => this.options.onAgentActivate(agent.id));

    const goal = visualTarget(visual.target, station.seat);
    const previousTile = previous ? {
      x: Math.max(1, Math.min(OFFICE_GRID_WIDTH - 2, Math.floor(previous.x / OFFICE_TILE_SIZE))),
      y: Math.max(1, Math.min(OFFICE_GRID_HEIGHT - 2, Math.floor(previous.y / OFFICE_TILE_SIZE)))
    } : undefined;
    const start = previousTile && isOfficeTileWalkable(previousTile.x, previousTile.y) ? previousTile : officeSpawn;
    const shouldMove = visual.realWork && visual.target !== 'seat';
    const tilePath = shouldMove ? findOfficePath({ width: OFFICE_GRID_WIDTH, height: OFFICE_GRID_HEIGHT, isWalkable: isOfficeTileWalkable }, start, goal) : [];
    const path = tilePath.map(tileToWorld);
    const initial = this.options.reducedMotion || path.length === 0 ? tileToWorld(goal) : previous ?? tileToWorld(start);
    view.position.set(initial.x, initial.y);
    return { agent, view, path: this.options.reducedMotion ? [] : path, pathIndex: 0, visual, signal };
  }

  private createStatusSignal(visual: OfficeVisualState): Container {
    const signal = new Container();
    const bubble = new Graphics();
    bubble.roundRect(-17, -52, 34, 13, 3).fill(0x0c1d27).stroke({ color: visual.color, width: 2 });
    signal.addChild(bubble);
    signal.addChild(this.makeLabel(visual.label, -14, -50, 7, visual.color));
    if (visual.envelope) {
      const envelope = new Graphics();
      envelope.rect(13, -35, 12, 8).fill(officePalette.white).stroke({ color: visual.color, width: 2 });
      envelope.moveTo(14, -34).lineTo(19, -30).lineTo(24, -34).stroke({ color: visual.color, width: 1 });
      signal.addChild(envelope);
    }
    if (visual.denial) signal.addChild(this.makeLabel('!', 12, -56, 14, officePalette.screenDanger));
    return signal;
  }

  private drawCanonicalSignals(model: OfficeSceneModel): void {
    if (!this.signalLayer) return;
    for (const { station, officeEntity } of model.agents) {
      const visual = visualStateForEntity(officeEntity);
      const x = station.desk.x * OFFICE_TILE_SIZE;
      const y = station.desk.y * OFFICE_TILE_SIZE;
      const light = new Graphics();
      light.rect(x + 10, y - 13, 18, 8).fill(visual.color);
      light.alpha = visual.realWork ? 1 : 0.55;
      this.signalLayer.addChild(light);
    }
  }

  private makeLabel(text: string, x: number, y: number, fontSize: number, fill: number): Text {
    const label = new Text({ text, style: { fontFamily: 'Consolas, monospace', fontSize, fontWeight: '700', fill } });
    label.position.set(x, y);
    label.resolution = Math.min(window.devicePixelRatio || 1, 2);
    return label;
  }

  private readonly onTick = (): void => {
    if (!this.app) return;
    let moving = 0;
    const seconds = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
    this.signalTime += seconds;
    for (const runtime of this.characters) {
      const target = runtime.path[runtime.pathIndex];
      if (target) {
        moving += 1;
        const deltaX = target.x - runtime.view.x;
        const deltaY = target.y - runtime.view.y;
        const distance = Math.hypot(deltaX, deltaY);
        const step = CHARACTER_SPEED * seconds;
        if (distance <= step) {
          runtime.view.position.set(target.x, target.y);
          runtime.pathIndex += 1;
        } else {
          runtime.view.position.set(runtime.view.x + deltaX / distance * step, runtime.view.y + deltaY / distance * step);
        }
      }
      if (runtime.visual.pulse) runtime.signal.alpha = 0.68 + Math.sin(this.signalTime * 5) * 0.25;
    }
    this.app.render();
    if (moving === 0) this.applyTickerPolicy();
  };

  private installInteraction(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.camera?.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
      this.renderAfterCameraChange();
    }, { passive: false });
    canvas.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.drag) return;
      this.camera?.panBy(event.clientX - this.drag.x, event.clientY - this.drag.y);
      this.drag = { x: event.clientX, y: event.clientY };
      this.renderAfterCameraChange();
    });
    const stopDrag = (): void => { this.drag = undefined; };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
  }

  private installLifecycle(canvas: HTMLCanvasElement): void {
    this.resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || !this.app || !this.camera) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width < 1 || height < 1) return;
      this.app.renderer.resize(width, height);
      this.camera.resize(width, height);
      this.app.render();
      this.updateCanvasData('ready');
      this.emitStats('ready');
    });
    this.resizeObserver.observe(this.options.host);

    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.intersecting = entry?.isIntersecting ?? false;
      this.applyTickerPolicy();
    });
    this.intersectionObserver.observe(this.options.host);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.recovery = installOfficeContextRecovery(canvas, (attempt) => {
      this.recoveryAttempts = attempt;
      this.updateCanvasData('recovering');
      this.emitStats('recovering');
      this.options.onRecoveryRequired(attempt);
    }, () => {
      this.updateCanvasData('failed');
      this.options.onFailure('WebGL recovery exhausted after three attempts.');
      this.emitStats('failed');
    });
  }

  private readonly onVisibilityChange = (): void => {
    this.documentVisible = document.visibilityState !== 'hidden';
    this.applyTickerPolicy();
  };

  private applyTickerPolicy(): void {
    if (!this.app) return;
    const movingCharacters = this.characters.filter((runtime) => runtime.pathIndex < runtime.path.length).length;
    const activeSignals = this.characters.filter((runtime) => runtime.visual.pulse || runtime.visual.envelope).length;
    const shouldRun = shouldRunSceneTicker({
      documentVisible: this.documentVisible,
      intersecting: this.intersecting,
      reducedMotion: this.options.reducedMotion,
      movingCharacters,
      activeSignals
    });
    if (shouldRun) this.app.ticker.start();
    else this.app.ticker.stop();
    this.tickerState = shouldRun ? 'running' : 'idle';
    this.updateCanvasData('ready');
  }

  private renderAfterCameraChange(): void {
    this.app?.render();
    this.updateCanvasData('ready');
    this.emitStats('ready');
  }

  private updateCanvasData(state: OfficeSceneStats['renderState']): void {
    if (!this.app?.renderer) return;
    const canvas = this.app.canvas;
    const camera = this.camera?.snapshot() ?? { x: 0, y: 0, zoom: 1 };
    canvas.dataset.renderState = state;
    canvas.dataset.tickerState = this.tickerState;
    canvas.dataset.cameraX = String(camera.x);
    canvas.dataset.cameraY = String(camera.y);
    canvas.dataset.cameraZoom = String(camera.zoom);
    canvas.dataset.characterCount = String(this.characters.length);
    canvas.dataset.recoveryAttempts = String(this.recoveryAttempts);
  }

  private emitStats(renderState: OfficeSceneStats['renderState']): void {
    this.options.onStats({
      renderState,
      tickerState: this.tickerState,
      camera: this.camera?.snapshot() ?? { x: 0, y: 0, zoom: 1 },
      characterCount: this.characters.length,
      recoveryAttempts: this.recoveryAttempts
    });
  }

  private destroyApplication(application: Application): void {
    try { application.ticker.stop(); } catch { /* already stopped */ }
    try { application.destroy(true, { children: true }); } catch { /* partial initialization */ }
  }
}
