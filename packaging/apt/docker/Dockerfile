FROM ubuntu:22.04

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
  && rm -rf /var/lib/apt/lists/*

# Add RoboClaw Studio APT repo
RUN curl -fsSL https://lazytatzv.github.io/motion_studio/roboclaw-studio.gpg \
    | gpg --dearmor -o /usr/share/keyrings/roboclaw-studio.gpg

RUN echo "deb [signed-by=/usr/share/keyrings/roboclaw-studio.gpg] https://lazytatzv.github.io/motion_studio stable main" \
    > /etc/apt/sources.list.d/roboclaw-studio.list

RUN apt-get update && apt-get install -y roboclaw-studio

CMD ["/usr/bin/roboclaw-studio"]
