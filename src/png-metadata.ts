/**
 * Embeds tEXt metadata chunks into a PNG buffer.
 *
 * Uses PNG tEXt chunks (key-value pairs) per the PNG specification.
 * These are readable by tools like `exiftool`, ImageMagick `identify`,
 * and most image viewers that support PNG metadata.
 *
 * No external dependencies — pure Node.js implementation.
 */

// Pre-compute CRC32 lookup table (PNG uses CRC-32/ISO-3309)
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c;
}

function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a single PNG tEXt chunk.
 *
 * Format: [4-byte length][4-byte "tEXt"][keyword\0value][4-byte CRC]
 */
function createTextChunk(key: string, value: string): Buffer {
    const keyword = Buffer.from(key, 'latin1');
    const nullSep = Buffer.from([0]);
    const text = Buffer.from(value, 'latin1');
    const data = Buffer.concat([keyword, nullSep, text]);

    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const type = Buffer.from('tEXt', 'ascii');

    // CRC is computed over type + data (not length)
    const crcValue = crc32(Buffer.concat([type, data]));
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcValue, 0);

    return Buffer.concat([length, type, data, crcBuf]);
}

/**
 * Embeds key-value metadata into a PNG buffer as tEXt chunks.
 *
 * Inserts the chunks immediately after the IHDR chunk, which is the
 * standard location for ancillary chunks per the PNG spec.
 */
export function embedPngMetadata(
    pngBuffer: Buffer,
    metadata: Record<string, string>
): Buffer {
    const PNG_SIGNATURE_LENGTH = 8;

    // IHDR is always the first chunk after the 8-byte PNG signature.
    // Chunk layout: [4-byte data length][4-byte type][data][4-byte CRC]
    const ihdrDataLength = pngBuffer.readUInt32BE(PNG_SIGNATURE_LENGTH);
    const insertPosition = PNG_SIGNATURE_LENGTH + 4 + 4 + ihdrDataLength + 4;

    // Build tEXt chunks for each metadata entry
    const chunks: Buffer[] = [];
    for (const [key, value] of Object.entries(metadata)) {
        if (value !== undefined && value !== '') {
            chunks.push(createTextChunk(key, value));
        }
    }

    if (chunks.length === 0) return pngBuffer;

    const metadataBuffer = Buffer.concat(chunks);

    // Splice metadata chunks in after IHDR
    const before = pngBuffer.subarray(0, insertPosition);
    const after = pngBuffer.subarray(insertPosition);

    return Buffer.concat([before, metadataBuffer, after]);
}
