import {
  Building2,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  MessageSquare,
  Package,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export type SupplierTab = { to: string; label: string };

export type SupplierSection = {
  to: string;
  label: string;
  icon: LucideIcon;
  tabs?: SupplierTab[];
  // Sub-pages that belong to the section without being a tab.
  alsoActive?: string[];
  exact?: boolean;
};

export const SUPPLIER_SECTIONS: SupplierSection[] = [
  { to: '/supplier', label: 'nav.dashboard', icon: LayoutDashboard, exact: true },
  {
    to: '/supplier/leads',
    label: 'nav.requests',
    icon: Inbox,
    tabs: [
      { to: '/supplier/leads', label: 'nav.inbox' },
      { to: '/supplier/offers', label: 'supplier.myOffers' },
    ],
  },
  {
    to: '/supplier/deals',
    label: 'nav.crm',
    icon: LayoutGrid,
    tabs: [
      { to: '/supplier/deals', label: 'nav.pipeline' },
      { to: '/supplier/tasks', label: 'nav.tasks' },
    ],
    alsoActive: ['/supplier/crm'],
  },
  { to: '/supplier/products', label: 'nav.products', icon: Package },
  {
    to: '/deals?workspace=supplier',
    label: 'nav.deals',
    icon: ShieldCheck,
    tabs: [
      { to: '/deals?workspace=supplier', label: 'nav.deals' },
      { to: '/balance?workspace=supplier', label: 'nav.balance' },
    ],
  },
  { to: '/conversations?workspace=supplier', label: 'nav.chats', icon: MessageSquare },
  {
    to: '/supplier/company',
    label: 'nav.company',
    icon: Building2,
    tabs: [
      { to: '/supplier/company', label: 'nav.profile' },
      { to: '/supplier/team', label: 'nav.team' },
    ],
  },
];

export const pathOf = (to: string) => to.split('?')[0];

const matchesPath = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

export function isSupplierSectionActive(section: SupplierSection, pathname: string) {
  if (section.exact) return pathname === pathOf(section.to);
  const paths = [
    section.to,
    ...(section.tabs ?? []).map((tab) => tab.to),
    ...(section.alsoActive ?? []),
  ];
  return paths.some((p) => matchesPath(pathname, pathOf(p)));
}

export function findSupplierTabSection(pathname: string) {
  return SUPPLIER_SECTIONS.find((s) => s.tabs?.some((tab) => pathOf(tab.to) === pathname));
}
