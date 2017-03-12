'use strict';

const _ = require('./util');

const DEFAULT = {
	header: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
	end: [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]
};

class Png {
	constructor(options) {
		this.index = 0; // 解码游标
		this.dataChunks = []; // 图像数据chunk数组
		this.length = 0; // 数据总长度

		let optionsType = _.getType(options);

		// 传入buffer数组，则做解码用
		if(optionsType === 'string') {
			this.buffer = _.stringToBuffer(options);
		} else if(optionsType === 'uint8array') {
			this.buffer = new Uint8Array(options);
		}

		// 传入对象，则做编码用
		if(optionsType === 'object') {
			this.options = options;
		}

		if(this.buffer) this.decode(true); // 预解码
	}

	/**
	 * 读取buffer数组的指定字节数
	 * @param  {Number} length 读取长度
	 * @return {Array}         读取到的数据
	 */
	readBytes(length) {
		let buffer = _.readBytes(this.buffer, this.index, length);
		this.index += length;

		return buffer;
	}

	/**
	 * 编码
	 * @return {Void}
	 */
	encode() {
		if(!this.options) {
			throw new Error('不存在待编码数据！');
		}

		// TODO
	}

	/**
	 * 解码
	 * @param  {Boolean}  onlyDecodePngInfo  是否只解析png的基本信息
	 * @return {Array}                       像素数组
	 */
	decode(onlyDecodePngInfo) {
		if(!this.buffer) {
			throw new Error('不存在待解码数据！');
		}

		this.decodeHeader(); // 解析头部信息

		this.decodeChunk(); // 解析IHDR数据块

		if(!onlyDecodePngInfo) {
			while(this.index < this.buffer.length) {
				// 继续解析其他数据块
				let type = this.decodeChunk();
				if(type === 'IEND') break;
			}

			this.decodeIDATChunks();
			return this.getPixels();
		}
	}

	/**
	 * 解码头部信息
	 * https://www.w3.org/TR/PNG/#5PNG-file-signature
	 * @return {Void}
	 */
	decodeHeader() {
		if(this.header) return;

		if(this.index !== 0) {
			throw new Error('png的index属性指向非0！');
		}

		let header = this.readBytes(8);
		if(!_.equal(header, DEFAULT.header)) {
			throw new Error('png的签名信息不合法！')
		}

		this.header = header;
	}

	/**
	 * 解码关键数据块：IHDR、PLTE、IDAT、IEND
	 * https://www.w3.org/TR/PNG/#5Chunk-layout
	 * @return {String} 数据块类型
	 */
	decodeChunk() {
		let length = _.readInt32(this.readBytes(4)); // 数据块长度

		if(length < 0) {
			throw new Error('不合法的数据块长度信息');
		}

		let type = _.bufferToString(this.readBytes(4)); // 数据块类型
		let chunkData = this.readBytes(length);
		let crc = this.readBytes(4); // crc冗余校验码

		switch(type) {
			case 'IHDR':
				this.decodeIHDR(chunkData);
				break;
			case 'PLTE':
				this.decodePLTE(chunkData);
				break;
			case 'IDAT':
				this.decodeIDAT(chunkData);
				break;
			case 'IEND':
				this.decodeIEND(chunkData);
				break;
		}

		return type;
	}

	/**
	 * 解码IHDR数据块
	 * https://www.w3.org/TR/PNG/#11IHDR
	 * @param  {Array} chunk 数据块信息
	 * @return {Void}
	 */
	decodeIHDR(chunk) {
		this.width = _.readInt32(chunk); // 宽
		this.height = _.readInt32(chunk, 4); // 高

		// 图像深度，即每个通道包含的位数
		this.bitDepth = _.readInt8(chunk, 8);
		if([1, 2, 4, 8, 16].indexOf(this.bitDepth) === -1) {
			throw new Error('不合法的图像深度！');
		}

		// 颜色类型
		// 其中 this.colors 代表每个像素数据包含的颜色数量信息
		this.colorType = _.readInt8(chunk, 9);
		switch(this.colorType) {
			case 0:
				// 灰度图像
				this.colors = 1; 
				break;
			case 2:
				// rgb真彩色图像
				this.colors = 3;
				break;
			case 3:
				// 索引颜色图像
				this.colors = 1;
				break;
			case 4:
				// 灰度图像 + alpha通道
				this.colors = 2;
				this.alpha = true;
				break;
			case 6: 
				// rgb真彩色图像 + alpha通道
				this.colors = 4;
				this.alpha = true;
				break;
			default:
				throw new Error('不合法的颜色类型！');
		}

		// 压缩方法
		this.compressionMethod = _.readInt8(chunk, 10);
		if(this.compressionMethod !== 0) {
			throw new Error('不合法的压缩方法！');
		}

		// 过滤器方法
		this.filterMethod = _.readInt8(chunk, 11);
		if(this.filterMethod !== 0) {
			throw new Error('不合法的过滤器方法！');
		}

		// 行扫描方法
		this.interlaceMethod = _.readInt8(chunk, 12);
		if(this.interlaceMethod !== 0 && this.interlaceMethod !== 1) {
			throw new Error('不合法的行扫描方法！');
		}
	}

	/**
	 * 解码PLTE数据块
	 * https://www.w3.org/TR/PNG/#11PLTE
	 * @param  {Array} chunk 数据块信息
	 * @return {Void}
	 */
	decodePLTE(chunk) {
		if(chunk.length % 3 !== 0) {
			throw new Error('不合法的PLTE数据块长度！');
		}
		if(chunk.length > (Math.pow(2, this.bitDepth) * 3)) {
			throw new Error('调色板颜色数量不能超过图像深度规定的颜色数');
		}

		this.palette = chunk;
	}

	/**
	 * 解码IDAT数据块
	 * https://www.w3.org/TR/PNG/#11IDAT
	 * @param  {Array} chunk 数据块信息
	 * @return {Void}
	 */
	decodeIDAT(chunk) {
		this.dataChunks.push(chunk);
		this.length += chunk.length;
	}

	/**
	 * 解码IEND数据块
	 * https://www.w3.org/TR/PNG/#11IEND
	 * @param  {Array} chunk 数据块信息
	 * @return {Void}
	 */
	decodeIEND(chunk) {
		// ignore
	}

	/**
	 * 解码完整连续的IDAT数据块
	 * @return {Void}
	 */
	decodeIDATChunks() {
		let data = Buffer.alloc(this.length, 0xFF);
		let index = 0;
		this.dataChunks.forEach((chunk) => {
			chunk.forEach((item) => {data[index++] = item});
		});

		let bytesPerPixel = Math.max(1, this.colors * this.bitDepth / 8); // 每像素字节数
		let bytesPerRow = bytesPerPixel * this.width; // 每行字节数

		// inflate解压缩
		data = _.inflateSync(data);
		if(this.interlaceMethod === 0) {
			this.pixelsBuffer = this.interlaceNone(data, this.width, this.height, bytesPerPixel, bytesPerRow);
		} else {
			this.pixelsBuffer = this.interlaceAdam7(data, this.width, this.height, bytesPerPixel, bytesPerRow);
		}
	}

	/**
	 * 逐行扫描
	 * @param  {Array}  data           待扫描数据
	 * @param  {Number} width          图像宽度
	 * @param  {Number} height         图像高度
	 * @param  {Number} bytesPerPixel  每像素字节数
	 * @param  {Number} bytesPerRow    每行字节数
	 * @return {Array}                 已解析图像数据
	 */
	interlaceNone(data, width, height, bytesPerPixel, bytesPerRow) {
		let pixelsBuffer = Buffer.alloc(bytesPerPixel * width * height, 0xFF);
		let offset = 0; // 当前行的偏移位置

		// 逐行扫描解析
		// https://www.w3.org/TR/PNG/#4Concepts.EncodingScanlineAbs
		for(let i=0, len=data.length; i<len; i+=bytesPerRow+1) {
			let scanline = data.slice(i+1, i+1+bytesPerRow); // 当前行
			let args = [pixelsBuffer, scanline, bytesPerPixel, bytesPerRow, offset, true];

			// 第一个字节代表过滤类型
			let filterType = _.readInt8(data, i);
			switch(filterType) {
				case 0:
					this.filterNone.apply(this, args);
					break;
				case 1:
					this.filterSub.apply(this, args);
					break;
				case 2:
					this.filterUp.apply(this, args);
					break;
				case 3:
					this.filterAverage.apply(this, args);
					break;
				case 4:
					this.filterPaeth.apply(this, args);
					break;
				default:
					throw new Error('未知过滤类型！');
			}

			offset += bytesPerRow;
		}

		return pixelsBuffer;
	}

	/**
	 * Adam7扫描
	 * @param  {Array}  data           待扫描数据
	 * @param  {Number} width          图像宽度
	 * @param  {Number} height         图像高度
	 * @param  {Number} bytesPerPixel  每像素字节数
	 * @param  {Number} bytesPerRow    每行字节数
	 * @return {Array}                 已解析图像数据
	 */
	interlaceAdam7(data, width, height, bytesPerPixel, bytesPerRow) {
		let pixelsBuffer = Buffer.alloc(bytesPerPixel * width * height, 0xFF);

		let startX = [0, 0, 4, 0, 2, 0, 1];
		let incX = [8, 8, 8, 4, 4, 2, 2];
		let startY = [0, 4, 0, 2, 0, 1, 0];
		let incY = [8, 8, 4, 4, 2, 2, 1];

		let offset = 0;

		// 7次扫描
		for(let i=0; i<7; i++) {
			// 子图像信息
			let subWidth = Math.ceil((width - startY[i]) / incY[i], 10);
			let subHeight = Math.ceil((height - startX[i]) / incX[i], 10);
			let subBytesPerRow = bytesPerPixel * subWidth;
			let offsetEnd = offset + (subBytesPerRow + 1) * subHeight;
			let subData = data.slice(offset, offsetEnd);

			let subPixelsBuffer = this.interlaceNone(subData, subWidth, subHeight, bytesPerPixel, subBytesPerRow);
			let subOffset = 0;

			// 拷贝到正式图像数据位置
			// https://www.w3.org/TR/PNG/#figure48
			for(let x=startX[i]; x<height; x+=incX[i]) {
				for(let y=startY[i]; y<width; y+=incY[i]) {
					for(let z=0; z<bytesPerPixel; z++) {
						pixelsBuffer[(x * width + y) * bytesPerPixel + z] = subPixelsBuffer[subOffset++] & 0xFF;
					}
				}
			}

			offset = offsetEnd;
		}

		return pixelsBuffer;
	}

	/**
	 * 无过滤器
	 *
	 * @param  {Array}   pixelsBuffer  已经解析的图片数据
	 * @param  {Array}   scanline      当前行带解析数据
	 * @param  {Numver}  bytesPerPixel 每像素字节数
	 * @param  {Number}  bytesPerRow   每行字节数
	 * @param  {Number}  offset        偏移位置
	 * @param  {Boolean} isReverse     是否反向解析
	 * @return {Void}
	 */
	filterNone(pixelsBuffer, scanline, bytesPerPixel, bytesPerRow, offset, isReverse) {
		for(let i=0; i<bytesPerRow; i++) {
			pixelsBuffer[offset + i] = scanline[i] & 0xFF;
		}
	}

	/**
	 * Sub过滤器
	 * 增量 --> Row(x - bytesPerPixel)
	 *
	 * @param  {Array}   pixelsBuffer  已经解析的图片数据
	 * @param  {Array}   scanline      当前行带解析数据
	 * @param  {Numver}  bytesPerPixel 每像素字节数
	 * @param  {Number}  bytesPerRow   每行字节数
	 * @param  {Number}  offset        偏移位置
	 * @param  {Boolean} isReverse     是否反向解析
	 * @return {Void}
	 */
	filterSub(pixelsBuffer, scanline, bytesPerPixel, bytesPerRow, offset, isReverse) {
		for(let i=0; i<bytesPerRow; i++) {
			if(i < bytesPerPixel) {
				// 第一个像素，不作解析
				pixelsBuffer[offset + i] = scanline[i] & 0xFF;
			} else {
				// 其他像素
				let a = pixelsBuffer[offset + i - bytesPerPixel];

				let value = isReverse ? scanline[i] + a : scanline[i] - a;
				pixelsBuffer[offset + i] = value & 0xFF;
			}
		}
	}

	/**
	 * Up过滤器
	 * 增量 --> Row(x - bytesPerRow)
	 *
	 * @param  {Array}   pixelsBuffer  已经解析的图片数据
	 * @param  {Array}   scanline      当前行带解析数据
	 * @param  {Numver}  bytesPerPixel 每像素字节数
	 * @param  {Number}  bytesPerRow   每行字节数
	 * @param  {Number}  offset        偏移位置
	 * @param  {Boolean} isReverse     是否反向解析
	 * @return {Void}
	 */
	filterUp(pixelsBuffer, scanline, bytesPerPixel, bytesPerRow, offset, isReverse) {
		if(offset < bytesPerRow) {
			// 第一行，不作解析
			for(let i=0; i<bytesPerRow; i++) {
				pixelsBuffer[offset + i] = scanline[i] & 0xFF;
			}
		} else {
			for(let i=0; i<bytesPerRow; i++) {
				let b = pixelsBuffer[offset + i - bytesPerRow];

				let value = isReverse ? scanline[i] + b : scanline[i] - b;
				pixelsBuffer[offset + i] = value & 0xFF;
			}
		}
	}

	/**
	 * Average过滤器
	 * 增量 --> floor((Row(x - bytesPerPixel) + Row(x - bytesPerRow)) / 2)
	 *
	 * @param  {Array}   pixelsBuffer  已经解析的图片数据
	 * @param  {Array}   scanline      当前行带解析数据
	 * @param  {Numver}  bytesPerPixel 每像素字节数
	 * @param  {Number}  bytesPerRow   每行字节数
	 * @param  {Number}  offset        偏移位置
	 * @param  {Boolean} isReverse     是否反向解析
	 * @return {Void}
	 */
	filterAverage(pixelsBuffer, scanline, bytesPerPixel, bytesPerRow, offset, isReverse) {
		if(offset < bytesPerRow) {
			// 第一行，只做Sub
			for(let i=0; i<bytesPerRow; i++) {
				if(i < bytesPerPixel) {
					// 第一个像素，不作解析
					pixelsBuffer[offset + i] = scanline[i] & 0xFF;
				} else {
					// 其他像素
					let a = pixelsBuffer[offset + i - bytesPerPixel];

					let value = isReverse ? scanline[i] + (a >> 1) : scanline[i] - (a >> 1); // 需要除以2
					pixelsBuffer[offset + i] = value & 0xFF;
				}
			}
		} else {
			for(let i=0; i<bytesPerRow; i++) {
				if(i < bytesPerPixel) {
					// 第一个像素，只做Up
					let b = pixelsBuffer[offset + i - bytesPerRow];

					let value = isReverse ? scanline[i] + (b >> 1) : scanline[i] - (b >> 1); // 需要除以2
					pixelsBuffer[offset + i] = value & 0xFF;
				} else {
					// 其他像素
					let a = pixelsBuffer[offset + i - bytesPerPixel];
					let b = pixelsBuffer[offset + i - bytesPerRow];

					let value = isReverse ? scanline[i] + ((a + b) >> 1) : scanline[i] - ((a + b) >> 1);
					pixelsBuffer[offset + i] = value & 0xFF;
				}
			}
		}
	}

	/**
	 * Paeth过滤器
	 * 增量 --> Pr
	 * 
	 * pr的求导方法
	 * p = a + b - c
	 * pa = abs(p - a)
	 * pb = abs(p - b)
	 * pc = abs(p - c)
	 * if pa <= pb and pa <= pc then Pr = a
     * else if pb <= pc then Pr = b
     * else Pr = c
     * return Pr
     *
     * @param  {Array}   pixelsBuffer  已经解析的图片数据
	 * @param  {Array}   scanline      当前行带解析数据
	 * @param  {Numver}  bytesPerPixel 每像素字节数
	 * @param  {Number}  bytesPerRow   每行字节数
	 * @param  {Number}  offset        偏移位置
	 * @param  {Boolean} isReverse     是否反向解析
	 * @return {Void}
	 */
	filterPaeth(pixelsBuffer, scanline, bytesPerPixel, bytesPerRow, offset, isReverse) {
		if(offset < bytesPerRow) {
			// 第一行，只做Sub
			for(let i=0; i<bytesPerRow; i++) {
				if(i < bytesPerPixel) {
					// 第一个像素，不作解析
					pixelsBuffer[offset + i] = scanline[i] & 0xFF;
				} else {
					// 其他像素
					let a = pixelsBuffer[offset + i - bytesPerPixel];

					let value = isReverse ? scanline[i] + a : scanline[i] - a;
					pixelsBuffer[offset + i] = value & 0xFF;
				}
			}
		} else {
			for(let i=0; i<bytesPerRow; i++) {
				if(i < bytesPerPixel) {
					// 第一个像素，只做Up
					let b = pixelsBuffer[offset + i - bytesPerRow];

					let value = isReverse ? scanline[i] + b : scanline[i] - b;
					pixelsBuffer[offset + i] = value & 0xFF;
				} else {
					// 其他像素
					let a = pixelsBuffer[offset + i - bytesPerPixel];
					let b = pixelsBuffer[offset + i - bytesPerRow];
					let c = pixelsBuffer[offset + i - bytesPerRow - bytesPerPixel];

					let p = a + b - c;
					let pa = Math.abs(p - a);
					let pb = Math.abs(p - b);
					let pc = Math.abs(p - c);
					let pr;

					if (pa <= pb && pa <= pc) pr = a;
					else if (pb <= pc) pr = b;
					else pr = c;

					let value = isReverse ? scanline[i] + pr : scanline[i] - pr;
					pixelsBuffer[offset + i] = value & 0xFF;
				}
			}
		}
	}

	/**
	 * 获取像素数组
	 * @return {Array} 像素数组
	 */
	getPixels() {
		if(this.pixels) return pixels;

		if(!this.pixelsBuffer) {
			throw new Error('像素数据还没有解析！');
		}

		let pixels = this.pixels = new Array(this.width);

		for(let i=0; i<this.width; i++) {
			pixels[i] = new Array(this.height);

			for(let j=0; j<this.height; j++) {
				pixels[i][j] = this.getPixel(i, j);
			}
		}

		return pixels; 
	}

	/**
	 * 获取像素
	 * @param  {Number} x x坐标
	 * @param  {Number} y y坐标
	 * @return {Array}    rgba色值
	 */
	getPixel(x, y) {
		if(x < 0 || x >= this.width || y < 0 || y >= this.height) {
			throw new Error('x或y的值超出了图像边界！');
		}

		if(this.pixels && this.pixels[x][y]) return this.pixels[x][y];

		let bytesPerPixel = Math.max(1, this.colors * this.bitDepth / 8); // 每像素字节数
		let index = bytesPerPixel * (y * this.width + x);

		let pixelsBuffer = this.pixelsBuffer;

		switch(this.colorType) {
			case 0: 
				// 灰度图像
				return [pixelsBuffer[index], pixelsBuffer[index], pixelsBuffer[index], 255];
			case 2: 
				// rgb真彩色图像
				return [pixelsBuffer[index], pixelsBuffer[index + 1], pixelsBuffer[index + 2], 255];
			case 3: 
				// 索引颜色图像
				return [this.palette[pixelsBuffer[index] * 3 + 0], this.palette[pixelsBuffer[index] * 3 + 1], this.palette[pixelsBuffer[index] * 3 + 2], 255];
			case 4: 
				// 灰度图像 + alpha通道
				return [pixelsBuffer[index], pixelsBuffer[index], pixelsBuffer[index], pixelsBuffer[index + 1]];
			case 6: 
				// rgb真彩色图像 + alpha通道
				return [pixelsBuffer[index], pixelsBuffer[index + 1], pixelsBuffer[index + 2], pixelsBuffer[index + 3]];
		}
	}

}

module.exports = Png;