FROM node:22-slim
RUN npm install -g @bytecodealliance/jco
WORKDIR /agent
COPY . .
RUN ./build.sh
CMD ["sh", "-c", "cp dist/agent.wasm /out/agent.wasm"]
