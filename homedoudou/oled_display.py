import spidev
import gpiod
import time
import os
import socket
import signal
import sys
import json
from gpiod.line import Direction, Value
from PIL import Image, ImageDraw, ImageFont

DC_PIN = 24
RST_PIN = 25
WIDTH = 128
HEIGHT = 64
REFRESH = 3
DATA_FILE = "/tmp/oled_data.json"

# GPIO + SPI
chip = gpiod.Chip("/dev/gpiochip0")
dc_req = chip.request_lines(config={DC_PIN: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.INACTIVE)})
rst_req = chip.request_lines(config={RST_PIN: gpiod.LineSettings(direction=Direction.OUTPUT, output_value=Value.INACTIVE)})

spi = spidev.SpiDev()
spi.open(0, 0)
spi.max_speed_hz = 8000000
spi.mode = 0


def command(cmd):
    dc_req.set_value(DC_PIN, Value.INACTIVE)
    spi.writebytes([cmd])


def cleanup(sig=None, frame=None):
    command(0xAE)
    spi.close()
    sys.exit(0)


signal.signal(signal.SIGTERM, cleanup)
signal.signal(signal.SIGINT, cleanup)

# Reset
rst_req.set_value(RST_PIN, Value.INACTIVE)
time.sleep(0.1)
rst_req.set_value(RST_PIN, Value.ACTIVE)
time.sleep(0.1)

# Init SSD1306
for c in [0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3, 0x00, 0x40,
          0x8D, 0x14, 0x20, 0x00, 0xA1, 0xC8, 0xDA, 0x12,
          0x81, 0xCF, 0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0xAF]:
    command(c)

prev_stat = None


def read_cpu_stat():
    with open("/proc/stat") as f:
        return list(map(int, f.readline().split()[1:]))


def get_cpu_pct():
    global prev_stat
    cur = read_cpu_stat()
    if prev_stat is None:
        prev_stat = cur
        time.sleep(0.2)
        cur = read_cpu_stat()
    delta = [cur[i] - prev_stat[i] for i in range(len(cur))]
    prev_stat = cur
    idle = delta[3]
    total = sum(delta)
    return 100.0 * (1.0 - idle / total) if total > 0 else 0


def get_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return float(f.read().strip()) / 1000
    except Exception:
        return 0


def get_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "N/A"


def get_uptime():
    with open("/proc/uptime") as f:
        secs = float(f.read().split()[0])
    d = int(secs // 86400)
    h = int((secs % 86400) // 3600)
    m = int((secs % 3600) // 60)
    return f"{d}j {h}h{m:02d}" if d > 0 else f"{h}h{m:02d}"


def read_addon_data():
    """Lit les donnees envoyees par l'addon Node.js"""
    try:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return None


def send_buffer(img):
    buf = [0] * 1024
    for page in range(8):
        for x in range(128):
            byte = 0
            for bit in range(8):
                y = page * 8 + bit
                if y < HEIGHT and img.getpixel((x, y)):
                    byte |= (1 << bit)
            buf[page * 128 + x] = byte
    command(0x21); command(0); command(127)
    command(0x22); command(0); command(7)
    dc_req.set_value(DC_PIN, Value.ACTIVE)
    for i in range(0, 1024, 32):
        spi.writebytes(buf[i:i+32])


font = ImageFont.load_default()
print("OLED display demarre (Ctrl+C pour arreter)")

while True:
    img = Image.new("1", (WIDTH, HEIGHT), 0)
    draw = ImageDraw.Draw(img)

    addon_data = read_addon_data()

    if addon_data and "lines" in addon_data:
        # Mode addon : afficher les donnees de l'addon HomeDoudou
        y = 0
        for i, line in enumerate(addon_data["lines"][:5]):
            text = line.get("text", "")
            if line.get("invert"):
                draw.rectangle([0, y, 127, y + 11], fill=1)
                draw.text((2, y + 1), text, fill=0, font=font)
            else:
                draw.text((0, y + 1), text, fill=1, font=font)
            y += 12

        # Derniere ligne : infos systeme
        cpu = get_cpu_pct()
        temp = get_temp()
        draw.text((0, 53), f"CPU:{cpu:.0f}% {temp:.0f}C  {get_ip()}", fill=1, font=font)
    else:
        # Mode standalone : afficher les infos systeme
        draw.rectangle([0, 0, 127, 11], fill=1)
        draw.text((2, 1), "Raspberry Pi 3", fill=0, font=font)

        cpu = get_cpu_pct()
        temp = get_temp()

        y = 14
        draw.text((0, y), f"CPU: {cpu:.0f}%   Temp: {temp:.1f}C", fill=1, font=font)

        try:
            with open("/proc/meminfo") as f:
                lines = f.readlines()
            mem = {}
            for l in lines[:5]:
                parts = l.split()
                mem[parts[0].rstrip(":")] = int(parts[1])
            total = mem["MemTotal"] / 1024
            avail = mem.get("MemAvailable", mem["MemFree"]) / 1024
            draw.text((0, y + 11), f"RAM: {total - avail:.0f}/{total:.0f}MB", fill=1, font=font)
        except Exception:
            draw.text((0, y + 11), "RAM: N/A", fill=1, font=font)

        draw.text((0, y + 22), f"IP: {get_ip()}", fill=1, font=font)
        draw.text((0, y + 33), f"Up: {get_uptime()}", fill=1, font=font)

    send_buffer(img)
    time.sleep(REFRESH)
