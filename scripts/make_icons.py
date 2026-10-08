# Icons: 4x4-Farbverlauf (bilinear aus 4 Ecken) mit festen Eckpunkten – wie im Spiel
from PIL import Image, ImageDraw
C = [(232,84,107),(238,194,90),(122,63,143),(63,211,95)]
def icon(s, path):
    im = Image.new('RGB', (s, s), (0, 0, 0)); d = ImageDraw.Draw(im)
    n, pad = 4, s * 0.1; cell = (s - 2 * pad) / n; g = max(1, s // 90)
    for i in range(n):
        for j in range(n):
            u, v = j / (n - 1), i / (n - 1)
            col = tuple(int((1-u)*(1-v)*C[0][k] + u*(1-v)*C[1][k] + (1-u)*v*C[2][k] + u*v*C[3][k]) for k in range(3))
            x, y = pad + j * cell, pad + i * cell
            d.rectangle([x + g, y + g, x + cell - g, y + cell - g], fill=col)
            if (i, j) in [(0,0),(0,3),(3,0),(3,3)]:
                r = cell * 0.09; cx, cy = x + cell/2, y + cell/2
                d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(0,0,0))
    im.save(path)
icon(192, 'icons/icon-192.png'); icon(512, 'icons/icon-512.png'); icon(180, 'apple-touch-icon.png')
