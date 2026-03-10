FROM rust:1.78-slim
RUN cargo install cargo-component --locked && \
    cargo install wasm-tools --locked && \
    rustup target add wasm32-wasip1
WORKDIR /agent
COPY . .
RUN ./build.sh
CMD ["sh", "-c", "cp dist/agent.wasm /out/agent.wasm"]
