import type { Container } from 'pixi.js';

export interface OfficeCameraSnapshot {
  x: number;
  y: number;
  zoom: number;
}

const MIN_ZOOM = 0.7;
const MAX_ZOOM = 2.4;

export class OfficeCamera {
  private viewWidth = 1;
  private viewHeight = 1;
  private x = 0;
  private y = 0;
  private zoom = 1;

  public constructor(
    private readonly world: Container,
    private readonly worldWidth: number,
    private readonly worldHeight: number
  ) {}

  public resize(width: number, height: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    if (this.x === 0 && this.y === 0) this.reset();
    else this.apply();
  }

  public reset(): void {
    const fit = Math.min(this.viewWidth / this.worldWidth, this.viewHeight / this.worldHeight);
    this.zoom = clamp(fit * 0.94, MIN_ZOOM, 1.15);
    this.x = (this.viewWidth - this.worldWidth * this.zoom) / 2;
    this.y = (this.viewHeight - this.worldHeight * this.zoom) / 2;
    this.apply();
  }

  public zoomBy(factor: number, anchorX = this.viewWidth / 2, anchorY = this.viewHeight / 2): void {
    const previous = this.zoom;
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const worldX = (anchorX - this.x) / previous;
    const worldY = (anchorY - this.y) / previous;
    this.x = anchorX - worldX * this.zoom;
    this.y = anchorY - worldY * this.zoom;
    this.clampToView();
    this.apply();
  }

  public panBy(deltaX: number, deltaY: number): void {
    this.x += deltaX;
    this.y += deltaY;
    this.clampToView();
    this.apply();
  }

  public snapshot(): OfficeCameraSnapshot {
    return { x: Math.round(this.x), y: Math.round(this.y), zoom: Number(this.zoom.toFixed(3)) };
  }

  private clampToView(): void {
    const scaledWidth = this.worldWidth * this.zoom;
    const scaledHeight = this.worldHeight * this.zoom;
    this.x = scaledWidth <= this.viewWidth
      ? (this.viewWidth - scaledWidth) / 2
      : clamp(this.x, this.viewWidth - scaledWidth, 0);
    this.y = scaledHeight <= this.viewHeight
      ? (this.viewHeight - scaledHeight) / 2
      : clamp(this.y, this.viewHeight - scaledHeight, 0);
  }

  private apply(): void {
    this.world.position.set(Math.round(this.x), Math.round(this.y));
    this.world.scale.set(this.zoom);
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
