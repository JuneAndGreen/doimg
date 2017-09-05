'use strict';

module.exports = {
	/**
	 * 判断两个数组是否相等
	 * @param  {Array}   a 数组a
	 * @param  {Array}   b 数组b
	 * @return {Boolean}   判断结果
	 */
	equal(a, b) {
		if (a.length !== b.length) return false;

		for (let i = 0, len = a.length; i < len; i++) {
			if (a[i] !== b[i]) return false;
		}

		return true;
	},

	/**
	 * 读取32位无符号整型数
	 * @param  {Array}  buffer buffer数组
	 * @param  {Number} offset 偏移量
	 * @return {Number}        读取到的整型数
	 */
	readInt32(buffer, offset) {
		offset = offset || 0;
		return (buffer[offset] << 24) + (buffer[offset + 1] << 16) + (buffer[offset + 2] << 8) + (buffer[offset + 3] << 0);
	},

	/**
	 * 读取16位无符号整型数
	 * @param  {Array}  buffer buffer数组
	 * @param  {Number} offset 偏移量
	 * @return {Number}        读取到的整型数
	 */
	readInt16(buffer, offset) {
		offset = offset || 0;
		return (buffer[offset] << 8) + (buffer[offset + 1] << 0);
	},

	/**
	 * 读取8位无符号整型数
	 * @param  {Array}  buffer buffer数组
	 * @param  {Number} offset 偏移量
	 * @return {Number}        读取到的整型数
	 */
	readInt8(buffer, offset) {
		offset = offset || 0;
		return buffer[offset] << 0;
	},

	/**
	 * 数字转8位二进制字符串
	 * @param {Number} num 输入数字
	 * @return {String}    输出二进制字符串
	 */
	numberToString(num) {
		num = num.toString(2).split('');

		while (num.length < 8) {
			num.unshift(0);
		}

		return num.join('');
	},

	/**
	 * 数字转8位二进制数组
	 * @param {Number} num 输入数字
	 * @return {Array}     输出二进制数组
	 */
	numberToArray(num) {
		num = num.toString(2).split('');

		while (num.length < 8) {
			num.unshift(0);
		}

		return num.map(item => parseInt(item, 10));
	},

	/**
	 * 将buffer数组转为字符串
	 * @param  {Array}  buffer buffer数组
	 * @return {String}        字符串
	 */
	bufferToString(buffer) {
		let str = '';
		for (let i = 0, len = buffer.length; i < len; i++){
			str += String.fromCharCode(buffer[i]);
		}
		return str;
	},

	/**
	 * 将字符串转为buffer数组
	 * @param  {String}   str 字符串
	 * @return {Array}        buffer数组
	 */
	stringToBuffer(str) {
		let buffer = Buffer.alloc(str.length, 0xFF);
		str.forEach((char, index) => {
			buffer[index] = char.charCodeAt(0) & 0xFF;
		});

		return buffer;
	},

	/**
	 * 获取某个对象的类型
	 * @param  {Object} o 传入对象
	 * @return {String}   该对象类型
	 */
	getType(o) {
		return Object.prototype.toString.call(o).slice(8, -1).toLowerCase();
	},

	/**
	 * 读取buffer数组的指定字节数
	 * @param  {Array}  buffer buffer数组
	 * @param  {Number} begin  开始游标
	 * @param  {Number} length 读取长度
	 * @return {Array}         读取到的数据
	 */
	readBytes(buffer, begin, length) {
		let end = begin + length;
		if (end > buffer.length) {
			throw new Error('读取的长度超出了buffer数组的界限！');
		}

		return buffer.slice(begin, end);
	},

	/**
	 * 重复字符串若干次
	 * @param  {String} str   待重复字符串
	 * @param  {Number} count 重复次数
	 * @return {Sting}        已重复字符串
	 */
	repeatString(str, count) {
		return (new Array(count + 1)).join(str);
	},

	/**
	 * 矩阵相乘
	 * @param  {Array} a 矩阵a
	 * @param  {Array} b 矩阵b
	 * @return {Array}   输出矩阵
	 */
	multiplyMatrix(a, b) {
		let output = [];
		let rows = a[0].length;
		let columns = b.length;
		for (let i = 0; i < columns; i++) {
			output[i] = [];
			for (let j = 0; j < rows; j++) {
				let value = 0;
				for (let x = 0; x < a.length; x++) {
					value += a[x][j] * b[i][x];
				}

				output[i][j] = value;
			}
		}

		return output;
	},

	/**
	 * 一维数组转矩阵
	 * @param  {Array}  input  输入一维数组
	 * @param  {Number} width  输出矩阵的宽度
	 * @param  {Number} height 输出矩阵的高度
	 * @return {Array}         输出矩阵
	 */
	arrayToMatrix(input, w, h) {
		let output = [];
		for (let i = 0; i < w; i++) {
			output[i] = [];
			for (let j = 0; j < h; j++) {
				output[i][j] = input[j * w + i];
			}
		}

		return output;
	},

	/**
	 * 矩阵转一维数组
	 * @param  {Array}  input  输入矩阵
	 * @return {Array}         输出一维数组
	 */
	matrixToArray(input) {
		let output = [];
		for (let i = 0, w = input.length; i < w; i++) {
			for (let j = 0, h = input[i].length; j < h; j++) {
				output.push(input[i][j]);
			}
		}

		return output;
	},
};
