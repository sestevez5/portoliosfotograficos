import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AlbumForm } from './album-form';

const ALBUM = {
  nombre: 'Montaña',
  nombreNormalizado: 'montanya',
  descripcion: 'Picos',
  tags: ['nieve', 'roca'],
  portfolio: { nombre: 'Viajes', nombreNormalizado: 'viajes' },
  fotos: [],
};

describe('AlbumForm', () => {
  let http: HttpTestingController;
  let elemento: HTMLElement;

  // params: los de la ruta (fotografo, portfolio y, al editar, album).
  const crear = async (params: Record<string, string>) => {
    await TestBed.configureTestingModule({
      imports: [AlbumForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(params) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AlbumForm);
    http = TestBed.inject(HttpTestingController);
    elemento = fixture.nativeElement;
    await fixture.whenStable();
    return fixture;
  };
  const rellenar = (campo: string, valor: string) => {
    const control = elemento.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${campo}`)!;
    control.value = valor;
    control.dispatchEvent(new Event('input'));
  };
  const enviar = () => elemento.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

  it('no envía nada sin nombre', async () => {
    const fixture = await crear({ fotografo: 'ana-uno', portfolio: 'viajes' });
    enviar();
    fixture.detectChanges();
    http.expectNone(() => true);
    expect(elemento.textContent).toContain('Indica un nombre para el álbum.');
  });

  it('crea el álbum con sus tags y navega a su página', async () => {
    await crear({ fotografo: 'ana-uno', portfolio: 'viajes' });
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    rellenar('nombre', 'Montaña');
    rellenar('tags', ' nieve, , roca ');
    enviar();

    const peticion = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/api/fotografos/ana-uno/portfolios/viajes/albums'),
    );
    expect(peticion.request.body).toEqual({ nombre: 'Montaña', tags: ['nieve', 'roca'] });
    peticion.flush(ALBUM);
    expect(navegar).toHaveBeenCalledWith(['/', 'ana-uno', 'viajes', 'montanya']);
  });

  it('al editar carga los datos y muestra la regla incumplida si el backend responde 422', async () => {
    const fixture = await crear({ fotografo: 'ana-uno', portfolio: 'viajes', album: 'montanya' });
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/portfolios/viajes/albums/montanya')).flush(ALBUM);
    await fixture.whenStable();
    expect(elemento.querySelector<HTMLInputElement>('#nombre')!.value).toBe('Montaña');
    expect(elemento.querySelector<HTMLInputElement>('#tags')!.value).toBe('nieve, roca');

    rellenar('nombre', 'Mar');
    enviar();
    const peticion = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/albums/montanya'));
    expect(peticion.request.body).toEqual({ nombre: 'Mar', descripcion: 'Picos', tags: ['nieve', 'roca'] });
    peticion.flush(
      {
        tipo: 'reglaNegocioIncumplida',
        operacion: { codigo: 'EDITAR_ALBUM', descripcion: 'Modificar el álbum "Montaña" del portfolio "Viajes"' },
        regla: { codigo: 'ALBUM_NOMBRE_DUPLICADO', mensaje: 'Ya existe otro álbum con el mismo nombre.' },
        message: '…',
      },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    fixture.detectChanges();

    const aviso = elemento.querySelector('[role="alert"]')!.textContent!;
    expect(aviso).toContain('Modificar el álbum "Montaña"');
    expect(aviso).toContain('Ya existe otro álbum con el mismo nombre.');
  });
});
