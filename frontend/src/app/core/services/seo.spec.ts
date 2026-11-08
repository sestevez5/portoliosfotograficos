import { DOCUMENT } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { ColeccionDetalle } from '../models/catalogo.model';
import { NOMBRE_SITIO, SeoService, recortarDescripcion } from './seo';

@Component({ template: '' })
class Vacia {}

const COLECCION: ColeccionDetalle = {
  nombre: 'Mar',
  nombreNormalizado: 'mar',
  tags: [],
  portfolio: { nombre: 'Viajes', nombreNormalizado: 'viajes' },
  fotografo: { nombreInformal: 'Ana', nombreInformalNormalizado: 'ana' },
  visible: true,
  visibilidad: 'visible',
  fotos: [{ nombreFichero: 'ola.avif', orden: 0, url: '/photos/ana/viajes/mar/ola.avif' }],
};

describe('SeoService', () => {
  let router: Router;
  let seo: SeoService;
  let documento: Document;
  const robots = () => documento.head.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;
  const canonica = () => documento.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;
  const descripcion = () => documento.head.querySelector('meta[name="description"]')?.getAttribute('content');

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: ':fotografo/:portfolio/:coleccion', component: Vacia, data: { admiteVistaLimpia: true } },
          { path: '**', component: Vacia },
        ]),
      ],
    });
    router = TestBed.inject(Router);
    seo = TestBed.inject(SeoService);
    documento = TestBed.inject(DOCUMENT);
  });

  it('la portada se indexa, con su URL canónica', async () => {
    await router.navigateByUrl('/');
    expect(TestBed.inject(Title).getTitle()).toBe(NOMBRE_SITIO);
    expect(robots()).toBeNull();
    expect(canonica()).toBe(`${documento.location.origin}/`);
  });

  it('las páginas de la aplicación no se indexan', async () => {
    await router.navigateByUrl('/registro');
    expect(robots()).toBe('noindex');
    expect(canonica()).toBeNull();
  });

  it('una colección: su título, descripción y URL canónica (sin ?limpia=true)', async () => {
    await router.navigateByUrl('/Ana/viajes/mar?limpia=true');
    seo.coleccion(COLECCION);
    expect(TestBed.inject(Title).getTitle()).toBe('Mar · Viajes · Ana');
    expect(descripcion()).toBe('Colección «Mar» del portfolio «Viajes» de Ana: 1 foto.');
    expect(canonica()).toBe(`${documento.location.origin}/ana/viajes/mar`);
    expect(robots()).toBeNull();

    seo.coleccion({ ...COLECCION, visibilidad: 'oculto' });
    expect(robots()).toBe('noindex');
  });

  it('al navegar quita la vista previa y los datos estructurados de la primera página', async () => {
    documento.head.insertAdjacentHTML(
      'beforeend',
      '<meta property="og:title" content="x"><script type="application/ld+json" id="datos-estructurados">{}</script>',
    );
    await router.navigateByUrl('/');
    expect(documento.head.querySelector('meta[property="og:title"]')).not.toBeNull();
    await router.navigateByUrl('/registro');
    expect(documento.head.querySelector('meta[property="og:title"]')).toBeNull();
    expect(documento.getElementById('datos-estructurados')).toBeNull();
  });

  it('recortarDescripcion deja la descripción en 160 caracteres, por una palabra', () => {
    expect(recortarDescripcion(' Una\n foto ')).toBe('Una foto');
    const larga = recortarDescripcion('palabra '.repeat(40));
    expect(larga.length).toBeLessThanOrEqual(160);
    expect(larga.endsWith('palabra…')).toBe(true);
  });
});
