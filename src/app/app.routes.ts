import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage)
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding.page').then(m => m.OnboardingPage)
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