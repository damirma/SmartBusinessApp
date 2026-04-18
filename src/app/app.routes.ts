import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'upload',
    pathMatch: 'full',
  },
  {
    path: 'upload',
    loadComponent: () => import('./pages/upload/upload.page').then(m => m.UploadPage)
  },
  {
    path: 'facturas',
    loadComponent: () => import('./pages/facturas/facturas.page').then(m => m.FacturasPage)
  },
  {
    path: 'detalle/:id',
    loadComponent: () => import('./pages/detalle/detalle.page').then(m => m.DetallePage)
  },
];