FROM golang:1.23-slim
RUN wget -q https://github.com/tinygo-org/tinygo/releases/download/v0.34.0/tinygo0.34.0.linux-amd64.tar.gz \
    && tar -xf tinygo0.34.0.linux-amd64.tar.gz -C /usr/local \
    && rm tinygo0.34.0.linux-amd64.tar.gz
ENV PATH="$PATH:/usr/local/tinygo/bin"
RUN go install go.bytecodealliance.org/cmd/wkg@latest \
    && go install go.bytecodealliance.org/cmd/wit-bindgen-go@latest
WORKDIR /agent
COPY . .
RUN ./build.sh
CMD ["sh", "-c", "cp dist/agent.wasm /out/agent.wasm"]
