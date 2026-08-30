FROM python:3.11-slim

# Install system dependencies: ffmpeg, nodejs, curl, unzip
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install Deno for native yt-dlp BotGuard JavaScript runtime
RUN curl -fsSL https://deno.land/install.sh | sh
ENV PATH="/root/.deno/bin:$PATH"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p downloads && chmod 777 downloads

ENV PORT=5000
EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "8", "--timeout", "180", "app:app"]
