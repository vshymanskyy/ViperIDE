/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided "as is", without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

export class ConnectionUID {
    constructor(uid) {
        if (!ConnectionUID.uidre.test(uid)) {
            throw new Error('Malformed Connection ID');
        }
        this.uid = uid;
    }

    value() {
        return this.uid;
    }

    static uidcs = '0W8N4Y1HP5DF9K6JM3C2XA7R';
    static uidre = new RegExp(`^([${ConnectionUID.uidcs}]{4}-)*[${ConnectionUID.uidcs}]{4}$`);
    static uidtr = {
        'B':'8',  'E':'F',  'G':'6',  'I':'1',  'L':'1',  'O':'0',  'Q':'0',  'S':'5',
    };

    static random() {
        // Generate 10 random bytes
        const hexString = Array(20)
            .fill()
            .map(() => Math.round(Math.random() * 0xF).toString(16))
            .join('');

        const rnd = BigInt(`0x${hexString}`);
        const num = ConnectionUID._base24(rnd, 16);
        return new ConnectionUID(num.slice(0, 4) + '-' + num.slice(4, 8) + '-' + num.slice(8, 12));
    }

    static parse(input) {
        // Normalize (and validate) input
        return new ConnectionUID(input.toUpperCase().split('').map(char =>
            ConnectionUID.uidtr[char] || char
        ).join(''));
    }

    static _base24(n, length) {
        const base = BigInt(24);
        let res = "";
        let prev = null;
        while (res.length < length) {
            let c = ConnectionUID.uidcs[n % base];
            if (c === prev) {
                c = ConnectionUID.uidcs[(n + BigInt(1)) % base];
            }
            prev = c;
            res += c;
            n /= base;
        }
        return res;
    }
}
