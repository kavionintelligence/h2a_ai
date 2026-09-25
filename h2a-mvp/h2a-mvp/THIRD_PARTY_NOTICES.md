# H2A MVP Third-Party Notices

This repository is a local, non-commercial demonstration. The following supplied assets are used only under that restriction.

## InsightFace ArcFace Weight

- Asset: `public/biometric/models/face.onnx`
- Identified model: `buffalo_s/w600k_mbf.onnx`
- SHA-256: `9cc6e4a75f0e2bf0b1aed94578f144d15175f357bdc05e815e5c4a02b319eb4f`
- Upstream: <https://github.com/deepinsight/insightface>
- Terms: public pretrained weights are restricted to non-commercial research use unless separately licensed.

## Supplied Anti-Spoofing Weight

- Asset: `public/biometric/models/antispoofing_ep50.onnx`
- SHA-256: `f292ae67adea39ed9fad05773f1993a51a5b8c833cfbcea7646e03ce78377f95`
- Provenance: supplied by the project owner in the data-sharing client repository; no upstream model card or independent license was present.
- Terms: retained only for the owner-approved local, non-commercial demonstration. It must not be redistributed or used in a commercial or production claim without provenance review.

## BCH Codec

- Assets: `assets/biometric/bch_codec.cjs`, `assets/biometric/bch_codec.wasm`, and corresponding source under `third_party/bch/`
- Copyright notice in source: Parrot S.A.
- License: GNU General Public License version 2. See `third_party/bch/LICENSE-GPL-2.0.txt`.

## MediaPipe And ONNX Runtime

- MediaPipe Tasks Vision: Apache License 2.0, <https://github.com/google-ai-edge/mediapipe>
- ONNX Runtime: MIT License, <https://github.com/microsoft/onnxruntime>
- Their package license files remain included by the package manager; locally served runtime files are copied without modification.

The authoritative machine-readable hashes and use policy are in `public/biometric/MODEL_MANIFEST.json`.
