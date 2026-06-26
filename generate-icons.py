#!/usr/bin/env python3
"""Generate minimal PNG icons for WeChat Mini Program tab bar."""

import struct
import zlib
import os

def create_png(width, height, pixels_func):
    """Create a PNG file from a pixel function."""
    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'

    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr = make_chunk('IHDR', ihdr_data)

    # IDAT chunk - image data
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter byte: None
        for x in range(width):
            r, g, b, a = pixels_func(x, y)
            raw_data += struct.pack('BBBB', r, g, b, a)

    compressed = zlib.compress(raw_data)
    idat = make_chunk('IDAT', compressed)

    # IEND chunk
    iend = make_chunk('IEND', b'')

    return signature + ihdr + idat + iend

def make_chunk(chunk_type, data):
    """Create a PNG chunk."""
    chunk = chunk_type.encode('ascii') + data
    length = struct.pack('>I', len(data))
    crc = struct.pack('>I', zlib.crc32(chunk) & 0xFFFFFFFF)
    return length + chunk + crc

def draw_circle(cx, cy, r, color):
    """Return a pixel function that draws a circle."""
    def pixel_func(x, y):
        dx = x - cx
        dy = y - cy
        dist = (dx*dx + dy*dy) ** 0.5
        if dist <= r:
            # Simple anti-aliasing
            alpha = max(0, min(255, int(color[3] * (1 - (dist - r + 0.5) / 1))))
            return (color[0], color[1], color[2], alpha)
        return (0, 0, 0, 0)
    return pixel_func

def draw_rect(x1, y1, x2, y2, color):
    """Return a pixel function that draws a rectangle."""
    def pixel_func(x, y):
        if x1 <= x <= x2 and y1 <= y <= y2:
            return color
        return (0, 0, 0, 0)
    return pixel_func

def combine(*funcs):
    """Combine multiple pixel functions."""
    def combined(x, y):
        for func in reversed(funcs):
            r, g, b, a = func(x, y)
            if a > 128:
                return (r, g, b, a)
        return (0, 0, 0, 0)
    return combined

# Color definitions
GRAY = (138, 147, 132, 255)  # #8a9384
GREEN = (47, 125, 79, 255)   # #2f7d4f
WHITE = (255, 255, 255, 255)

def make_group_icon(color):
    """Create group icon (two people)."""
    size = 81
    funcs = []

    # Person 1 - head
    funcs.append(draw_circle(28, 25, 10, color))
    # Person 1 - body
    funcs.append(draw_rect(16, 40, 40, 65, color))

    # Person 2 - head
    funcs.append(draw_circle(54, 25, 10, color))
    # Person 2 - body
    funcs.append(draw_rect(42, 40, 66, 65, color))

    return combine(*funcs)

def make_checkin_icon(color):
    """Create check-in icon (calendar with checkmark)."""
    size = 81
    funcs = []

    # Calendar base (outline)
    funcs.append(draw_rect(15, 20, 65, 70, color))
    # Inner white
    funcs.append(draw_rect(18, 23, 62, 67, (255, 255, 255, 255)))

    # Checkmark
    check_funcs = []
    for t in range(100):
        # Line from (25, 45) to (38, 58)
        x = 25 + (38-25) * t / 99
        y = 45 + (58-45) * t / 99
        check_funcs.append(lambda x, y, t=t: (
            color[0], color[1], color[2],
            255 if abs(x - (25 + (38-25) * t / 99)) < 3 and abs(y - (45 + (58-45) * t / 99)) < 3 else 0
        )[3] if abs((x - (25 + (38-25) * t / 99))) < 3 else (0, 0, 0, 0))

    return combine(*funcs)

def simple_icon(pattern, color):
    """Create a simple icon based on a pattern."""
    size = 81

    def pixel_func(x, y):
        # Normalize to 0-1
        nx = x / size
        ny = y / size

        if pattern == 'group':
            # Two overlapping circles
            d1 = ((nx - 0.35)**2 + (ny - 0.35)**2)**0.5
            d2 = ((nx - 0.65)**2 + (ny - 0.35)**2)**0.5
            if d1 < 0.15 or d2 < 0.15:
                return color
            # Bodies
            if (0.2 < nx < 0.5 and 0.5 < ny < 0.8) or (0.5 < nx < 0.8 and 0.5 < ny < 0.8):
                return color
            return (0, 0, 0, 0)

        elif pattern == 'checkin':
            # Simple checkmark in a square
            if 0.2 < nx < 0.8 and 0.2 < ny < 0.8:
                # Border
                if x < 20 or x > 60 or y < 20 or y > 60:
                    return color
                # Checkmark
                cx, cy = x - 16, y - 16
                if 0 <= cx <= 40 and 0 <= cy <= 40:
                    # Simplified checkmark
                    if abs(cx - cy) < 3 and cx > 10:
                        return color
                    if abs(cx - (40 - cy)) < 3 and cx > 20:
                        return color
            return (0, 0, 0, 0)

        elif pattern == 'me':
            # Person silhouette
            d = ((nx - 0.5)**2 + (ny - 0.35)**2)**0.5
            if d < 0.15:
                return color
            if 0.3 < nx < 0.7 and 0.55 < ny < 0.8:
                return color
            return (0, 0, 0, 0)

        elif pattern == 'review':
            # Bar chart
            if 0.2 < nx < 0.4 and 0.4 < ny < 0.8:
                return color
            if 0.45 < nx < 0.65 and 0.3 < ny < 0.8:
                return color
            if 0.7 < nx < 0.9 and 0.2 < ny < 0.8:
                return color
            return (0, 0, 0, 0)

        return (0, 0, 0, 0)

    return pixel_func

def create_icon(pattern, color):
    """Create an icon with the given pattern and color."""
    pixel_func = simple_icon(pattern, color)

    def wrapper(x, y):
        nx = x / 81
        ny = y / 81

        if pattern == 'group':
            # Head 1
            d1 = ((x - 28)**2 + (y - 25)**2)**0.5
            if d1 <= 12:
                return color
            # Head 2
            d2 = ((x - 54)**2 + (y - 25)**2)**0.5
            if d2 <= 12:
                return color
            # Body 1
            if 16 <= x <= 40 and 40 <= y <= 65:
                return color
            # Body 2
            if 42 <= x <= 66 and 40 <= y <= 65:
                return color
            return (0, 0, 0, 0)

        elif pattern == 'checkin':
            # Calendar outline
            if 15 <= x <= 65 and 20 <= y <= 70:
                if x <= 18 or x >= 62 or y <= 23 or y >= 67:
                    return color
                # Checkmark
                if 25 <= x <= 55 and 35 <= y <= 55:
                    # Simplified checkmark
                    if abs((x - 25) - (y - 35) * 0.6) < 3:
                        return color
            return (0, 0, 0, 0)

        elif pattern == 'me':
            # Head
            d = ((x - 40)**2 + (y - 25)**2)**0.5
            if d <= 14:
                return color
            # Body
            if 22 <= x <= 58 and 48 <= y <= 70:
                return color
            return (0, 0, 0, 0)

        elif pattern == 'review':
            # Bars
            if 18 <= x <= 34 and 45 <= y <= 70:
                return color
            if 35 <= x <= 51 and 35 <= y <= 70:
                return color
            if 52 <= x <= 68 and 25 <= y <= 70:
                return color
            return (0, 0, 0, 0)

        return (0, 0, 0, 0)

    return wrapper

# Generate icons
icons = [
    ('tab-group', 'group', GRAY),
    ('tab-group-active', 'group', GREEN),
    ('tab-checkin', 'checkin', GRAY),
    ('tab-checkin-active', 'checkin', GREEN),
    ('tab-me', 'me', GRAY),
    ('tab-me-active', 'me', GREEN),
    ('tab-review', 'review', GRAY),
    ('tab-review-active', 'review', GREEN),
]

output_dir = 'program/images/tab-icons'
os.makedirs(output_dir, exist_ok=True)

for filename, pattern, color in icons:
    pixel_func = create_icon(pattern, color)
    png_data = create_png(81, 81, pixel_func)

    filepath = os.path.join(output_dir, f'{filename}.png')
    with open(filepath, 'wb') as f:
        f.write(png_data)
    print(f'Created: {filepath}')

print('\nDone!')
