import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { convertirAAvif } from './foto-avif.js';
import { leerExif, resumirMetadatos } from './metadatos-foto.js';

// Verde puro de sRGB, guardado en una foto con el perfil indicado (o sin perfil).
const verde = (perfil?: 'p3' | 'srgb' | 'cmyk') => {
  let imagen = sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 0, g: 255, b: 0 } } });
  if (perfil === 'cmyk') imagen = imagen.toColourspace('cmyk');
  if (perfil) imagen = imagen.withIccProfile(perfil);
  return imagen.jpeg({ quality: 100 }).toBuffer();
};
// Valores tal como están guardados en el fichero, sin gestión de color.
const pixelGuardado = async (imagen: Buffer) => [...(await sharp(imagen).keepIccProfile().raw().toBuffer()).subarray(0, 3)];
const cerca = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 3);

test('una foto con perfil RGB amplio (Display P3) lo conserva, sin pasar sus colores a sRGB', async () => {
  const original = await verde('p3');
  const { datos } = await convertirAAvif(original);
  assert.deepEqual((await sharp(datos).metadata()).icc, (await sharp(original).metadata()).icc);
  // En P3, el verde de sRGB se guarda como (117, 251, 76): son los mismos valores, no convertidos.
  assert.ok(cerca(await pixelGuardado(datos), await pixelGuardado(original)), String(await pixelGuardado(datos)));
});

test('también lo conserva al reducirla', async () => {
  const original = await sharp({ create: { width: 5000, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } } })
    .withIccProfile('p3')
    .jpeg()
    .toBuffer();
  const { datos, ancho } = await convertirAAvif(original);
  assert.equal(ancho, 3840);
  assert.deepEqual((await sharp(datos).metadata()).icc, (await sharp(original).metadata()).icc);
  assert.ok(cerca(await pixelGuardado(datos), [117, 251, 76]));
});

test('una foto sin perfil, en sRGB o en CMYK se guarda en sRGB', async () => {
  const srgb = (await sharp(await verde('srgb')).metadata()).icc;
  for (const perfil of [undefined, 'srgb', 'cmyk'] as const) {
    const { datos } = await convertirAAvif(await verde(perfil));
    const meta = await sharp(datos).metadata();
    assert.equal(meta.space, 'srgb', String(perfil));
    if (perfil !== 'cmyk') {
      assert.deepEqual(meta.icc, srgb, String(perfil));
      assert.ok(cerca(await pixelGuardado(datos), [0, 255, 0]), `${perfil}: ${await pixelGuardado(datos)}`);
    }
  }
});

const conExif = async () =>
  sharp(await verde('srgb'))
    .withExif({
      IFD0: { Make: 'FUJIFILM', Model: 'X-T5', Artist: 'Ana Uno', Copyright: 'Ana Uno 2026' },
      IFD2: { ExposureTime: '1/250', FNumber: '28/10', ISOSpeedRatings: '400', DateTimeOriginal: '2026:05:01 10:20:30', LensModel: 'XF23mmF1.4 R', FocalLength: '23/1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 25/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '3/1 42/1 0/1' },
    })
    .jpeg()
    .toBuffer();

test('la foto guardada conserva su EXIF, salvo la ubicación GPS', async () => {
  const { datos } = await convertirAAvif(await conExif());
  const exif = await leerExif(datos);
  assert.equal(exif?.Image?.Model, 'X-T5');
  assert.equal(exif?.Photo?.LensModel, 'XF23mmF1.4 R');
  assert.equal(exif?.Photo?.FNumber, 2.8);
  assert.deepEqual(exif?.GPSInfo ?? {}, {}); // el grupo queda vacío
  assert.ok(!datos.includes('GPSLatitude') && (await sharp(datos).metadata()).width === 64);
});

test('devuelve el EXIF completo, con la ubicación, para la BD, y su resumen no la incluye', async () => {
  const { metadatos } = await convertirAAvif(await conExif());
  const guardado = JSON.parse(metadatos!);
  assert.deepEqual(guardado.GPSInfo.GPSLatitude, [40, 25, 0]);
  assert.equal(guardado.Photo.DateTimeOriginal, '2026-05-01T10:20:30');
  assert.deepEqual(resumirMetadatos(metadatos), {
    camara: 'FUJIFILM X-T5',
    objetivo: 'XF23mmF1.4 R',
    distanciaFocal: 23,
    apertura: 2.8,
    exposicion: '1/250 s',
    iso: 400,
    fechaToma: '2026-05-01T10:20:30',
    autor: 'Ana Uno',
    copyright: 'Ana Uno 2026',
  });
});

test('una foto sin EXIF no tiene metadatos', async () => {
  const { metadatos } = await convertirAAvif(await verde('srgb'));
  assert.equal(metadatos, null);
  assert.equal(resumirMetadatos(metadatos), undefined);
});
