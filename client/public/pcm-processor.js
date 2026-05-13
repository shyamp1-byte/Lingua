class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._targetRate = (options.processorOptions && options.processorOptions.targetSampleRate) || 16000;
    this._ratio = sampleRate / this._targetRate;
    this._accumulated = 0;
    this._buffer = [];
    // flush every ~250ms worth of samples at target rate
    this._flushSize = Math.floor(this._targetRate * 0.25);
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this._accumulated += 1;
      if (this._accumulated >= this._ratio) {
        this._accumulated -= this._ratio;
        const s = Math.max(-1, Math.min(1, channel[i]));
        this._buffer.push(s < 0 ? s * 0x8000 : s * 0x7fff);
      }
    }

    if (this._buffer.length >= this._flushSize) {
      const pcm = new Int16Array(this._buffer);
      this.port.postMessage(pcm, [pcm.buffer]);
      this._buffer = [];
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
