import { Router } from 'express';
import { asegurarLogo } from '../services/logo.service.js';
import { organizacionFotos } from '../services/organizacion.service.js';
import type {
  Album,
  AlbumSummary,
  Fotografo,
  FotografoPublico,
  Portfolio,
  PortfolioSummary,
} from '../types/album.js';

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
  portfolio: Portfolio;
  album: Album;
}

const albumEntries: AlbumEntry[] = organizacion.flatMap((o) =>
  o.portfolios.flatMap((portfolio) => portfolio.albumes.map((album) => ({ slug: o.slug, portfolio, album }))),
);

function findFotografo(slug: string) {
  const wanted = toSlug(slug);
  return organizacion.find((o) => o.slug === wanted);
}

function findPortfolio(slug: string, portfolioId: string) {
  const fotografo = findFotografo(slug);
  const portfolio = fotografo?.portfolios.find((p) => p.id === portfolioId);
  return fotografo && portfolio ? { fotografo, portfolio } : undefined;
}

// /photos/<fotografo>/<portfolio>/<album>/<archivo>
function photoUrl({ slug, portfolio, album }: AlbumEntry, filename: string): string {
  return `/photos/${slug}/${portfolio.id}/${album.id}/${filename}`;
}

function coverPhotoUrl(entry: AlbumEntry): string {
  const { album } = entry;
  const cover = album.photos.find((p) => p.id === album.coverPhotoId) ?? album.photos[0];
  return cover ? photoUrl(entry, cover.filename) : '';
}

// Todos los fotógrafos tienen logo: si aún no existe se genera al pedirlo (GET /fotografos/:slug/logo).
function toFotografoPublico(slug: string, { logo, logoSubtitulo, ...fotografo }: Fotografo): FotografoPublico {
  return { ...fotografo, logoUrl: `/api/fotografos/${slug}/logo` };
}

function toSummary(entry: AlbumEntry): AlbumSummary {
  const { album } = entry;
  return {
    id: album.id,
    title: album.title,
    description: album.description,
    tags: album.tags,
    coverPhotoUrl: coverPhotoUrl(entry),
    photoCount: album.photos.length,
  };
}

// La portada de un portfolio es la del primer álbum.
function toPortfolioSummary(slug: string, portfolio: Portfolio): PortfolioSummary {
  const primero = portfolio.albumes[0];
  return {
    id: portfolio.id,
    title: portfolio.title,
    description: portfolio.description,
    coverPhotoUrl: primero ? coverPhotoUrl({ slug, portfolio, album: primero }) : '',
    albumCount: portfolio.albumes.length,
  };
}

function toDetail(entry: AlbumEntry) {
  const { portfolio, album } = entry;
  return {
    ...album,
    portfolio: { id: portfolio.id, title: portfolio.title },
    photos: [...album.photos]
      .sort((a, b) => a.order - b.order)
      .map((photo) => ({ ...photo, url: photoUrl(entry, photo.filename) })),
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
      portfolioCount: o.portfolios.length,
      albumCount: o.portfolios.reduce((total, p) => total + p.albumes.length, 0),
    })),
  );
});

albumsRouter.get('/fotografos/:slug', (req, res) => {
  const entry = findFotografo(req.params.slug);
  if (!entry) {
    res.status(404).json({ message: `Fotógrafo '${req.params.slug}' no encontrado` });
    return;
  }

  res.json({
    slug: entry.slug,
    ...toFotografoPublico(entry.slug, entry.fotografo),
    portfolios: entry.portfolios.map((p) => toPortfolioSummary(entry.slug, p)),
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

albumsRouter.get('/fotografos/:slug/portfolios/:portfolio', (req, res) => {
  const found = findPortfolio(req.params.slug, req.params.portfolio);
  if (!found) {
    res.status(404).json({ message: `Portfolio '${req.params.portfolio}' no encontrado para '${req.params.slug}'` });
    return;
  }

  const { fotografo, portfolio } = found;
  const entries = portfolio.albumes.map((album) => ({ slug: fotografo.slug, portfolio, album }));
  res.json({
    id: portfolio.id,
    title: portfolio.title,
    description: portfolio.description,
    albumes: filterByTag(entries, req.query.tag).map(toSummary),
  });
});

albumsRouter.get('/fotografos/:slug/portfolios/:portfolio/albums/:id', (req, res) => {
  const found = findPortfolio(req.params.slug, req.params.portfolio);
  const album = found?.portfolio.albumes.find((a) => a.id === req.params.id);
  if (!found || !album) {
    res.status(404).json({
      message: `Álbum '${req.params.id}' no encontrado en '${req.params.slug}/${req.params.portfolio}'`,
    });
    return;
  }

  res.json(toDetail({ slug: found.fotografo.slug, portfolio: found.portfolio, album }));
});
