# Ubuntu install test (Docker)

Build and run the image to verify `apt install roboclaw-studio` works.

```bash
docker build -t roboclaw-studio-apt-test ./packaging/apt/docker
```

```bash
docker run --rm -it roboclaw-studio-apt-test
```

Note: GUI apps won't display in a headless container; this only checks installability.
