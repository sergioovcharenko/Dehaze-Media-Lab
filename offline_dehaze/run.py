"""Offline DehazeFormer single-image inference. Uses original IDKiro architecture."""
import argparse
from pathlib import Path
from collections import OrderedDict
import time
import numpy as np
import torch
from PIL import Image
from models.dehazeformer import dehazeformer_t, dehazeformer_s, dehazeformer_b, dehazeformer_m

MODELS = {'t': dehazeformer_t, 's': dehazeformer_s, 'b': dehazeformer_b, 'm': dehazeformer_m}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--image', required=True)
    p.add_argument('--weights-dir', default='models')
    p.add_argument('--output-dir', default='results')
    p.add_argument('--models', nargs='+', choices=MODELS, default=list(MODELS))
    p.add_argument('--max-side', type=int, default=768)
    args = p.parse_args()
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    img = Image.open(args.image).convert('RGB')
    if args.max_side and max(img.size) > args.max_side:
        ratio = args.max_side / max(img.size)
        img = img.resize((round(img.width*ratio), round(img.height*ratio)), Image.Resampling.LANCZOS)
    arr = np.asarray(img, dtype=np.float32)/255.0
    x = torch.from_numpy(arr).permute(2,0,1).unsqueeze(0).to(device)*2-1
    outdir = Path(args.output_dir)
    outdir.mkdir(parents=True, exist_ok=True)
    img.save(outdir/'original.png')
    for name in args.models:
        path = Path(args.weights_dir)/f'dehazeformer-{name}.pth'
        if not path.is_file():
            print(f'{name}: missing {path}')
            continue
        model = MODELS[name]().to(device).eval()
        checkpoint = torch.load(path, map_location='cpu', weights_only=False)
        state = checkpoint.get('state_dict', checkpoint)
        state = OrderedDict((k[7:] if k.startswith('module.') else k, v) for k,v in state.items())
        model.load_state_dict(state, strict=True)
        start = time.perf_counter()
        with torch.inference_mode():
            y = model(x).clamp(-1,1)
        elapsed = time.perf_counter()-start
        y = ((y[0].permute(1,2,0).cpu().numpy()+1)*127.5).clip(0,255).astype(np.uint8)
        Image.fromarray(y).save(outdir/f'dehazeformer-{name}.png')
        print(f'{name}: {elapsed:.2f}s, {y.shape[1]}x{y.shape[0]}, {device}')
        del model
if __name__ == '__main__':
    main()
