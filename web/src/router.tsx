import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router-dom'
import AppShell from './app/AppShell'
import AnalyticsPage from './app/pages/AnalyticsPage'
import AssistantPage from './app/pages/AssistantPage'
import Dashboard from './app/pages/Dashboard'
import InventoryPage from './app/pages/inventory/InventoryPage'
import ProductDetail from './app/pages/inventory/ProductDetail'
import InvoiceDetail from './app/pages/invoices/InvoiceDetail'
import InvoicesPage from './app/pages/invoices/InvoicesPage'
import NotFound from './app/pages/NotFound'
import OrderDetail from './app/pages/orders/OrderDetail'
import OrdersPage from './app/pages/orders/OrdersPage'
import CustomersPage from './app/pages/parties/CustomersPage'
import { CustomerDetailPage, SupplierDetailPage } from './app/pages/parties/PartyDetail'
import SuppliersPage from './app/pages/parties/SuppliersPage'
import PODetail from './app/pages/purchasing/PODetail'
import PurchasingPage from './app/pages/purchasing/PurchasingPage'
import SettingsPage from './app/pages/SettingsPage'
import AuthPage from './landing/AuthPage'
import Landing from './landing/Landing'

const routes = [
  { path: '/', element: <Landing /> },
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  {
    path: '/app',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'inventory/:id', element: <ProductDetail /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'suppliers/:id', element: <SupplierDetailPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'purchase-orders', element: <PurchasingPage /> },
      { path: 'purchase-orders/:id', element: <PODetail /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'orders/:id', element: <OrderDetail /> },
      { path: 'invoices', element: <InvoicesPage /> },
      { path: 'invoices/:id', element: <InvoiceDetail /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'assistant', element: <AssistantPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFound inApp /> },
    ],
  },
  { path: '*', element: <NotFound /> },
]

// In-memory routing only for the single-file preview build, where the URL cannot carry routes.
export const router = import.meta.env.VITE_ROUTER === 'memory' ? createMemoryRouter(routes) : createBrowserRouter(routes)
