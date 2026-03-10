#!/bin/bash

# Build and push Docker image for binance-futures-bot-web
# This script automatically generates a tag based on the current date

IMAGE=registry.codewalk.myds.me/archtown
TAG=$(date +"%Y.%m.%d-%H%M%S")
TAG=latest

echo "=========================================="
echo "Building Docker Image"
echo "=========================================="
echo "Image: $IMAGE"
echo "Tag: $TAG"
# echo "Platforms: linux/amd64,linux/arm64"
echo "Dockerfile: Dockerfile"
echo "=========================================="
echo ""

# Build and push
# --platform linux/amd64,linux/arm64 \
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t $IMAGE:$TAG \
  --push .

if [ $? -eq 0 ]; then
  echo ""
  echo "=========================================="
  echo "✓ Build successful!"
  echo "=========================================="
  echo "New image tag: $TAG"
  echo ""
  echo "To update docker-compose files, change the image tag to:"
  echo "  image: $IMAGE:$TAG"
  echo "  cd /share/ZFS18_DATA/docker/docker-compose"
  echo "  sh deploy-web.sh $TAG bot-film-web"
  echo ""
  echo "Run with persistent data (volume):"
  echo "  docker run -p 6001:80 -v binance-futures-bot-web-data:/app/data $IMAGE:$TAG"
  echo "=========================================="
else
  echo ""
  echo "=========================================="
  echo "✗ Build failed!"
  echo "=========================================="
  exit 1
fi


