# DehazeFormer offline comparison (PC Python)
Original architecture from https://github.com/IDKiro/DehazeFormer (check upstream license).
Install: python -m pip install torch numpy pillow timm
Place user-provided weights dehazeformer-t.pth, -s.pth, -b.pth, -m.pth in offline_dehaze/models/.
From offline_dehaze/ run: python run.py --image path/to/photo.jpg
Outputs original.png and one PNG per model in results/. Defaults to max 768px; --max-side 0 keeps original resolution and may exhaust memory.
All processing is local after dependencies are installed. CPU can be slow. Not an Android APK and not integrated with browser UI. Checkpoints should come from a trusted source; PyTorch checkpoint deserialization can execute code.
