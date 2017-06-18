var Transform = require('stream').Transform;
var util = require('util');

var MAX_DICT = 4096;

function LZWDecoder(dataBits) {
  Transform.call(this);
  
  this.dataBits = dataBits || 8;
  this.clearCode = 1 << this.dataBits;
  this.data = this.bits = 0;
  this.codeSize = this.dataBits + 1;
  this.codeMask = (1 << this.codeSize) - 1;
  this.avail = this.clearCode + 2;
  this.lastCode = -1;
  this.firstChar = 0;
  
  this.prefix = new Uint16Array(MAX_DICT);
  this.suffix = new Uint8Array(MAX_DICT);
  this.suffixLength = new Uint16Array(MAX_DICT);
  for (var i = 0; i < this.clearCode; i++) {
    this.suffix[i] = i;
    this.suffixLength[i] = 1;
  }
  
  // allocate output buffer
  this.bufferSize = 1024;
  this.buffer = new Buffer(this.bufferSize + MAX_DICT);
  this.pos = 0;
}

util.inherits(LZWDecoder, Transform);

LZWDecoder.prototype._transform = function(block, encoding, done) {
  for (var i = 0; i < block.length; i++) {
    // Fill buffer
    this.data |= block[i] << this.bits;
    this.bits += 8;
  
    while (this.bits >= this.codeSize) {
      // read a code from the buffer
      var code = this.data & this.codeMask;
      this.data >>= this.codeSize;
      this.bits -= this.codeSize;
    
      // Reset dictionary if requested
      if (code === this.clearCode) {
        this.codeSize = this.dataBits + 1;
        this.codeMask = (1 << this.codeSize) - 1;
        this.avail = this.clearCode + 2;
        this.lastCode = -1;
        continue;
      }
    
      // Check for explicit end of stream
      if (code === this.clearCode + 1) {
        done();
        return;
      }
      
      var c = code;
      var codeLength = 0;
    
      if (code < this.avail) {
        // Existing code
        codeLength = this.suffixLength[code];
        this.pos += codeLength;
      } else if (code === this.avail && this.lastCode !== -1) {
        // New code to be added to the dictionary
        codeLength = this.suffixLength[this.lastCode] + 1;
        code = this.lastCode;
        this.pos += codeLength;
        this.buffer[--this.pos] = this.firstChar;
      } else {
        return this.emit('error', new Error('Invalid LZW code'));
      }

      // Fill output buffer by working backward through the prefix list
      while (code >= this.clearCode) {
        this.buffer[--this.pos] = this.suffix[code];
        code = this.prefix[code];
      }
    
      this.buffer[--this.pos] = this.firstChar = this.suffix[code];
    
      // Extend the dictionary with a new codeword
      if (this.avail < MAX_DICT && this.lastCode !== -1) {
        this.prefix[this.avail] = this.lastCode;
        this.suffix[this.avail] = this.firstChar;
        this.suffixLength[this.avail] = this.suffixLength[this.lastCode] + 1;
      
        // Increase codeword length if we've used up all the codes of the current length
        if (++this.avail < MAX_DICT && !(this.avail & this.codeMask)) {
          this.codeSize++;
          this.codeMask += this.avail;
        }
      }
          
      this.lastCode = c;
      this.pos += codeLength;
    
      // Output a buffer if we can
      if (this.pos >= this.bufferSize) {
        this.push(new Buffer(this.buffer.slice(0, this.bufferSize)));
          
        // Move the remaining bytes to the beginning of the buffer
        this.buffer.copy(this.buffer, 0, this.bufferSize);
        this.pos -= this.bufferSize;
      }
    }
  }
  
  done();
}

LZWDecoder.prototype._flush = function(done) {
  if (this.pos > 0)
    this.push(this.buffer.slice(0, this.pos));
    
  done();
}

module.exports = LZWDecoder;