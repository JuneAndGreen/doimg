'use strict';

const _ = require('../util/util');

const DEFAULT = {
	header: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
	end: [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]
};

class Png {
	constructor(options) {
		let data = options;

		if(_.getType(data) === 'string') {
			this.data = _.stringToBuffer(data);
		} else if(_.getType(data) === 'ArrayBuffer') {
			this.data = new Uint8Array(data);
		}

		this.index = 0; // 解码游标
		this.dataChunks = []; // 图像数据chunk数组
		this.length = 0; // 数据总长度
	}

	/**
	 * 读取buffer数组的指定字节数
	 * @param  {Number} length 读取长度
	 * @return {Array}         读取到的数据
	 */
	readBytes(length) {
		let buffer = _.readBytes(this.data, this.index, length);
		this.index += length;

		return buffer;
	}

	decode() {

	}

	/**
	 * 解码头部信息
	 * https://www.w3.org/TR/2003/REC-PNG-20031110/#5PNG-file-signature
	 */
	decodeHeader() {
		if(this.index !== 0) {
			throw new Error('png的index属性指向非0！');
		}

		let header = this.readBytes(8);
		if(!equal(header) = DEFAULT.header) {
			throw new Error('png的签名信息不合法！')
		}

		this.header = header;
	}

	/**
	 * 解码关键数据块：IHDR、PLTE、IDAT、IEND
	 * https://www.w3.org/TR/2003/REC-PNG-20031110/#5Chunk-layout
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
	 * https://www.w3.org/TR/2003/REC-PNG-20031110/#11IHDR
	 * @param  {Array} chunk 数据块信息
	 */
	decodeIHDR(chunk) {
		this.width = _.readInt32(chunk); // 宽
		this.height = _.readInt32(chunk, 4); // 高

		// 图像深度，即每个颜色信息包含的位数
		this.bitDepth = _.readInt32(chunk, 8);
		if([1, 2, 4, 8, 16].indexOf(this.bitDepth) === -1) {
			throw new Error('不合法的图像深度！');
		}

		// 颜色类型
		// 其中 this.colors 代表每个像素数据包含的颜色数量信息
		this.colorType = _.readInt32(chunk, 9);
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
		this.compressionMethod = _.readInt32(chunk, 10);
		if(this.compressionMethod !== 0) {
			throw new Error('不合法的压缩方法！');
		}

		// 过滤器方法
		this.filterMethod = _.readInt32(chunk, 11);
		if(this.filterMethod !== 0) {
			throw new Error('不合法的过滤器方法！');
		}

		// 行扫描方法
		this.InterlaceMethod = _.readInt32(chunk, 12);
		if(this.InterlaceMethod !== 0 && this.InterlaceMethod !== 1) {
			throw new Error('不合法的行扫描方法！');
		}
	}

	/**
	 * 解码PLTE数据块
	 * https://www.w3.org/TR/2003/REC-PNG-20031110/#11PLTE
	 * @param  {Array} chunk 数据块信息
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
	 * https://www.w3.org/TR/2003/REC-PNG-20031110/#11IDAT
	 * @param  {Array} chunk 数据块信息
	 */
	decodeIDAT(chunk) {
		this.dataChunks.push(chunk);
		this.length += chunk.length;
	}

	/**
	 * 解码IEND数据块
	 * https://www.w3.org/TR/2003/REC-PNG-20031110/#11IEND
	 * @param  {Array} chunk 数据块信息
	 */
	decodeIEND(chunk) {
		if(!equal(chunk) = DEFAULT.end) {
			throw new Error('不合法的IEND数据块！')
		}
	}

	/**
	 * 解码完整连续的IDAT数据块
	 */
	decodeIDATChunks() {
		let data = new Buffer(this.length);
		let index = 0;
		this.dataChunks.forEach((chunk) => {
			chunk.forEach((itme) => {data[index++] = item});
		});

		// inflate
	}

	/**
	 * 逐行扫描
	 * @param  {Array} data 待扫描数据
	 */
	interlaceNone(data) {
		let bytesPerPixel = Math.max(1, this.colors * this.bitDepth / 8); // 每像素字节数
		let bytesPerRow = bytesPerPixel * this.width; // 每行字节数

		let pixelsBuffer = new Buffer(bpp * png.width * png.height);
		let offset = 0; // 当前行的偏移位置

		// 逐行扫描解析
		for(let i=0, len=data.length; i<len; i+=bytesPerRow) {
			let scanline = Array.prototype.slice.call(data, i+1, i+bytesPerRow); // 当前行

			// 第一个字节代表过滤类型
			switch(_.readInt8(data, i)) {
				case 0:
					this.unFilterNone(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset);
					break;
				case 1:
					this.unFilterSub(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset);
					break;
				case 2:
					this.unFilterUp(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset);
					break;
				case 3:
					this.unFilterAverage(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset);
					break;
				case 4:
					this.unFilterPaeth(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset);
					break;
				default:
					throw new Error('未知过滤类型！');
			}

			offset += bytesPerRow;
		}
	}

	/**
	 * Adam7扫描
	 * @param  {Array} data 待扫描数据
	 */
	interlaceAdam7(data) {
		throw new Error('暂不支持Adam7扫描方式！');
	}

	/**
	 * 无过滤器解析
	 * @param  {Array}  scanline      当前行带解析数据
	 * @param  {Array}  pixelsBuffer  解析后数据
	 * @param  {Numver} bytesPerPixel 每像素字节数
	 * @param  {Number} bytesPerRow   每行字节数
	 * @param  {Number} offset        偏移位置
	 */
	unFilterNone(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset) {

	}

	/**
	 * [unFilterNone description]
	 * @param  {Array}  scanline      当前行带解析数据
	 * @param  {Array}  pixelsBuffer  解析后数据
	 * @param  {Numver} bytesPerPixel 每像素字节数
	 * @param  {Number} bytesPerRow   每行字节数
	 * @param  {Number} offset        偏移位置
	 */
	unFilterSub(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset) {

	}

	/**
	 * [unFilterNone description]
	 * @param  {Array}  scanline      当前行带解析数据
	 * @param  {Array}  pixelsBuffer  解析后数据
	 * @param  {Numver} bytesPerPixel 每像素字节数
	 * @param  {Number} bytesPerRow   每行字节数
	 * @param  {Number} offset        偏移位置
	 */
	unFilterUp(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset) {

	}

	/**
	 * [unFilterNone description]
	 * @param  {Array}  scanline      当前行带解析数据
	 * @param  {Array}  pixelsBuffer  解析后数据
	 * @param  {Numver} bytesPerPixel 每像素字节数
	 * @param  {Number} bytesPerRow   每行字节数
	 * @param  {Number} offset        偏移位置
	 */
	unFilterAverage(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset) {

	}

	/**
	 * [unFilterNone description]
	 * @param  {Array}  scanline      当前行带解析数据
	 * @param  {Array}  pixelsBuffer  解析后数据
	 * @param  {Numver} bytesPerPixel 每像素字节数
	 * @param  {Number} bytesPerRow   每行字节数
	 * @param  {Number} offset        偏移位置
	 */
	unFilterPaeth(scanline, pixelsBuffer, bytesPerPixel, bytesPerRow, offset) {

	}

}