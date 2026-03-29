'use strict';

class NetworkManager {
  constructor() {
    this.socket = null;
    this.myId = null;
    this.onState = null;
    this.onDeath = null;
    this.onRespawn = null;
    this.onKillfeed = null;
  }

  connect() {
    this.socket = io();

    this.socket.on(Protocol.S_WELCOME, (data) => {
      this.myId = data.id;
    });

    this.socket.on(Protocol.S_STATE, (data) => {
      if (this.onState) this.onState(data);
    });

    this.socket.on(Protocol.S_DEATH, (data) => {
      if (this.onDeath) this.onDeath(data);
    });

    this.socket.on(Protocol.S_RESPAWN, (data) => {
      if (this.onRespawn) this.onRespawn(data);
    });

    this.socket.on(Protocol.S_KILLFEED, (data) => {
      if (this.onKillfeed) this.onKillfeed(data);
    });
  }

  join(name) {
    this.socket.emit(Protocol.C_JOIN, { name });
  }

  sendInput(inputState) {
    this.socket.emit(Protocol.C_INPUT, inputState);
  }

  sendSkill(index) {
    this.socket.emit(Protocol.C_SKILL, { index });
  }

  sendEvolve(className) {
    this.socket.emit(Protocol.C_EVOLVE, { className });
  }
}
