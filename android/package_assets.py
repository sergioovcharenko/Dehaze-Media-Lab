from pathlib import Path
import shutil

root=Path(__file__).resolve().parent.parent
target=root/'app/src/main/assets'
target.mkdir(parents=True,exist_ok=True)
for filename in ('index.html','manifest.webmanifest','sw.js'):
    shutil.copy2(root/filename,target/filename)
for name in ('src','assets'):
    dest=target/name
    if dest.exists():shutil.rmtree(dest)
    shutil.copytree(root/name,dest)
shutil.copy2(root/'android/tablet.css',target/'tablet.css')
shutil.copy2(root/'android/tablet.js',target/'tablet.js')
index=target/'index.html'
html=index.read_text(encoding='utf-8')
html=html.replace('</head>','<link rel="stylesheet" href="./tablet.css">\n</head>')
html=html.replace('</body>','<script src="./tablet.js"></script>\n</body>')
index.write_text(html,encoding='utf-8')
print('Offline site assets copied to',target)
