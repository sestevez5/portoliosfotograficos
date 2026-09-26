import { Router } from 'express';
import { asegurarLogo } from '../services/logo.service.js';
import { organizacionFotos } from '../services/organizacion.service.js';
import type { Album, AlbumSummary, Fotografo, FotografoPublico } from '../types/album.js';

// El slug de un fotógrafo es su primer nombre sin acentos y en minúsculas ("Santi Estévez" -> "santi").
// También es el nombre de su carpeta en backend/datos/fotos.
function toSlug(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)[0]
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const organizacion = organizacionFotos.map((o) => ({
  ...o,
  slug: toSlug(o.fotografo.nombre),
}));

interface AlbumEntry {
  slug: string;
  album: Album;
}

const albumEntries: AlbumEntry[] = organizacion.flatMap((o) =>
  o.albumes.map((album) => ({ slug: o.slug, album })),
);

function findFotografo(slug: string) {
  const wanted = toSlug(slug);
  return organizacion.find((o) => o.slug === wanted);
}

// /photos/<fotografo>/<album>/<archivo>
function photoUrl(slug: string, albumId: string, filename: string): string {
  return `/photos/${slug}/${albumId}/${filename}`;
}

// Todos los fotógrafos tienen logo: si aún no existe se genera al pedirlo (GET /fotografos/:slug/logo).
function toFotografoPublico(slug: string, { logo, logoSubtitulo, ...fotografo }: Fotografo): FotografoPublico {
  return { ...fotografo, logoUrl: `/api/fotografos/${slug}/logo` };
}

function toSummary({ slug, album }: AlbumEntry): AlbumSummary {
  const cover = album.photos.find((p) => p.id === album.coverPhotoId) ?? album.photos[0];
  return {
    id: album.id,
    title: album.title,
    description: album.description,
    tags: album.tags,
    coverPhotoUrl: cover ? photoUrl(slug, album.id, cover.filename) : '',
    photoCount: album.photos.length,
  };
}

function toDetail({ slug, album }: AlbumEntry) {
  return {
    ...album,
    photos: [...album.photos]
      .sort((a, b) => a.order - b.order)
      .map((photo) => ({ ...photo, url: photoUrl(slug, album.id, photo.filename) })),
  };
}

function filterByTag(list: AlbumEntry[], tag: unknown): AlbumEntry[] {
  return typeof tag === 'string' ? list.filter((e) => e.album.tags.includes(tag)) : list;
}

export const albumsRouter = Router();

albumsRouter.get('/albums', (req, res) => {
  res.json(filterByTag(albumEntries, req.query.tag).map(toSummary));
});

albumsRouter.get('/albums/:id', (req, res) => {
  const entry = albumEntries.find((e) => e.album.id === req.params.id);
  if (!entry) {
    res.status(404).json({ message: `Álbum '${req.params.id}' no encontrado` });
    return;
  }

  res.json(toDetail(entry));
});

albumsRouter.get('/tags', (_req, res) => {
  const tags = new Set<string>();
  albumEntries.forEach((e) => e.album.tags.forEach((t) => tags.add(t)));
  res.json([...tags].sort());
});

albumsRouter.get('/fotografos', (_req, res) => {
  res.json(
    organizacion.map((o) => ({
      slug: o.slug,
      ...toFotografoPublico(o.slug, o.fotografo),
      albumCount: o.albumes.length,
    })),
  );
});

albumsRouter.get('/fotografos/:slug', (req, res) => {
  const entry = findFotografo(req.params.slug);
  if (!entry) {
    res.status(404).json({ message: `Fotógrafo '${req.params.slug}' no encontrado` });
    return;
  }

  const entries = entry.albumes.map((album) => ({ slug: entry.slug, album }));
  res.json({
    slug: entry.slug,
    ...toFotografoPublico(entry.slug, entry.fotografo),
    albumes: filterByTag(entries, req.query.tag).map(toSummary),
  });
});

albumsRouter.get('/fotografos/:slug/logo', (req, res) => {
  const entry = findFotografo(req.params.slug);
  if (!entry) {
    res.status(404).json({ message: `Fotógrafo '${req.params.slug}' no encontrado` });
    return;
  }

  res.set('Cache-Control', 'public, max-age=3600');
  res.sendFile(asegurarLogo(entry.slug, entry.fotografo));
});

albumsRouter.get('/fotografos/:slug/albums/:id', (req, res) => {
  const fotografo = findFotografo(req.params.slug);
  const album = fotografo?.albumes.find((a) => a.id === req.params.id);
  if (!fotografo || !album) {
    res.status(404).json({ message: `Álbum '${req.params.id}' no encontrado para '${req.params.slug}'` });
    return;
  }

  res.json(toDetail({ slug: fotografo.slug, album }));
});
