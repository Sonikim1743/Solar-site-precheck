import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerrainPdfBytes, exportTerrainAreaPdf, terrainPdfFileName } from '../src/utils/terrainPdf.js'

// Real RGB JPEG encoding of a synthetic 2×1 solid-green image. No site imagery.
const JPEG = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooorU/Gj//Z'
const page = () => ({ bytes: Uint8Array.from(Buffer.from(JPEG, 'base64')), width: 2, height: 1 })
const asLatin1 = bytes => Buffer.from(bytes).toString('latin1')

test('PDF writer creates exactly two A3 landscape pages with JPEG XObjects and no active content', () => {
  const bytes = createTerrainPdfBytes([page(), page()])
  const pdf = asLatin1(bytes)
  assert.ok(bytes instanceof Uint8Array)
  assert.match(pdf, /^%PDF-1\.4\n/)
  assert.match(pdf, /\/Type \/Pages \/Kids \[3 0 R 6 0 R\] \/Count 2/)
  assert.equal([...pdf.matchAll(/\/Type \/Page\b/g)].length, 2)
  assert.equal([...pdf.matchAll(/\/Subtype \/Image/g)].length, 2)
  assert.equal([...pdf.matchAll(/\/Filter \/DCTDecode/g)].length, 2)
  const boxes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)]
  assert.equal(boxes.length, 2)
  for (const [, width, height] of boxes) {
    assert.ok(Math.abs(Number(width) * 25.4 / 72 - 420) < 1e-6)
    assert.ok(Math.abs(Number(height) * 25.4 / 72 - 297) < 1e-6)
    assert.ok(Number(width) > Number(height))
  }
  assert.doesNotMatch(pdf, /\/JavaScript|\/OpenAction|\/URI|\/Launch/)
  assert.match(pdf, /%%EOF\n$/)
})

test('xref offsets and startxref point to exact bytes even after binary JPEG streams', () => {
  const bytes = createTerrainPdfBytes([page(), page()])
  const pdf = asLatin1(bytes)
  const start = Number(pdf.match(/startxref\n(\d+)\n%%EOF/)?.[1])
  assert.equal(asLatin1(bytes.slice(start, start + 9)), 'xref\n0 9\n')
  const entries = pdf.slice(start).split('\n').slice(2, 11)
  assert.equal(entries.length, 9)
  assert.equal(entries[0], '0000000000 65535 f ')
  let previous = 0
  for (let id = 1; id <= 8; id++) {
    assert.match(entries[id], /^\d{10} 00000 n $/)
    const offset = Number(entries[id].slice(0, 10))
    assert.ok(offset > previous && offset < start)
    assert.equal(asLatin1(bytes.slice(offset, offset + `${id} 0 obj\n`.length)), `${id} 0 obj\n`)
    previous = offset
  }
  assert.match(pdf.slice(start), /trailer\n<< \/Size 9 \/Root 1 0 R >>/)
})

test('image and content stream Length values count actual bytes and preserve both JPEG payloads', () => {
  const original = page()
  const bytes = createTerrainPdfBytes([original, page()])
  const pdf = asLatin1(bytes)
  for (const id of [4, 7]) {
    const objectOffset = pdf.indexOf(`${id} 0 obj\n`)
    const streamOffset = pdf.indexOf('\nstream\n', objectOffset) + '\nstream\n'.length
    const dictionary = pdf.slice(objectOffset, streamOffset)
    const length = Number(dictionary.match(/\/Length (\d+)/)?.[1])
    assert.equal(length, original.bytes.length)
    assert.deepEqual(bytes.slice(streamOffset, streamOffset + length), original.bytes)
    assert.equal(asLatin1(bytes.slice(streamOffset + length, streamOffset + length + 10)), '\nendstream')
    assert.match(dictionary, /\/Width 2 \/Height 1 \/ColorSpace \/DeviceRGB \/BitsPerComponent 8/)
  }
  for (const id of [5, 8]) {
    const objectOffset = pdf.indexOf(`${id} 0 obj\n`)
    const streamOffset = pdf.indexOf('\nstream\n', objectOffset) + 8
    const length = Number(pdf.slice(objectOffset, streamOffset).match(/\/Length (\d+)/)?.[1])
    const content = asLatin1(bytes.slice(streamOffset, streamOffset + length))
    assert.match(content, /^q\n1190\.551181 0 0 841\.889764 0 0 cm\n\/Im0 Do\nQ\n$/)
    assert.equal(asLatin1(bytes.slice(streamOffset + length, streamOffset + length + 10)), '\nendstream')
  }
  original.bytes.fill(0)
  assert.ok(bytes.includes(255), 'returned PDF owns a copy of the source bytes')
})

test('writer rejects missing pages, invalid JPEGs and mismatched image dimensions', () => {
  for (const pages of [null, [], [page()], [page(),page(),page()]]) assert.throws(() => createTerrainPdfBytes(pages), /2ページ/)
  assert.throws(() => createTerrainPdfBytes([{ ...page(), width: 3 }, page()]), /寸法/)
  assert.throws(() => createTerrainPdfBytes([{ ...page(), height: 0 }, page()]), /寸法/)
  assert.throws(() => createTerrainPdfBytes([{ ...page(), bytes: new Uint8Array([255,216,255,217]) }, page()]), /JPEG/)
  const badEnd = page(); badEnd.bytes[badEnd.bytes.length - 1] = 0
  assert.throws(() => createTerrainPdfBytes([badEnd, page()]), /JPEG/)
  const grayscale = page()
  const sof = grayscale.bytes.findIndex((byte, index, bytes) => byte === 255 && bytes[index + 1] === 192)
  grayscale.bytes[sof + 9] = 1
  assert.throws(() => createTerrainPdfBytes([grayscale, page()]), /RGB/)
})

test('Japanese filenames are safe, bounded and dated in Japan time', () => {
  const date = new Date('2026-10-07T16:00:00Z')
  const name = terrainPdfFileName({ siteName: '合成候補地<>:"/\\|?*\u0000.  ' }, date)
  assert.match(name, /^地形参考図_合成候補地/)
  assert.match(name, /_2026-10-08\.pdf$/)
  assert.doesNotMatch(name, /[<>:"/\\|?*\u0000-\u001f]/)
  assert.equal(terrainPdfFileName({}, date), '地形参考図_候補地_2026-10-08.pdf')
  const emojiName = terrainPdfFileName({ siteName: '🌱'.repeat(100) }, date)
  assert.equal(emojiName, `地形参考図_${'🌱'.repeat(45)}_2026-10-08.pdf`)
  assert.ok(Buffer.byteLength(emojiName, 'utf8') < 255)
})

test('the browser exporter fails explicitly in a non-browser runtime', async () => {
  await assert.rejects(exportTerrainAreaPdf({ report: {}, element: null }), /ブラウザー/)
})
