"""Terminal Mandelbrot set. Pure MicroPython; no browser APIs required."""

CHARS = " .,:;irsXA253hMHGS#9B&@"


def render(width=48, height=14, max_iter=77):
    # Slightly compensate for terminal character aspect ratio.
    for py in range(height):
        cy = -1.15 + (2.30 * py / (height - 1))
        line = []
        for px in range(width):
            cx = -2.25 + (3.25 * px / (width - 1))
            x = y = 0.0
            n = 0

            while x * x + y * y <= 4.0 and n < max_iter:
                x, y = x * x - y * y + cx, 2.0 * x * y + cy
                n += 1

            if n == max_iter:
                line.append(CHARS[-1])
            else:
                # Smooth-ish palette based on escape iteration.
                index = int((n / max_iter) * (len(CHARS) - 1))
                line.append(CHARS[index])
        print("".join(line))


render()
