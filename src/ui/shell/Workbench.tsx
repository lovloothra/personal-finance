'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { MaskProvider } from '../contexts/MaskCtx';
import { FyProvider } from '../contexts/FyCtx';
import { DrawerProvider } from '../contexts/DrawerCtx';
import { ShellMetaProvider } from '../contexts/ShellMetaCtx';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Persistent workbench chrome: providers + sidebar + topbar around the routed
 * page. Lives in app/(workbench)/layout.tsx, so it survives soft navigations —
 * FY selection and mask state intentionally persist across page switches and
 * reset on a hard reload (mask defaults back to hidden).
 */
export function WorkbenchShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const contentRef = useRef<HTMLDivElement | null>(null);

  // `.content` is the scroller (the shell grid is overflow:hidden), so Next's
  // built-in scroll restoration never reaches it — reset manually per route.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [pathname]);

  return (
    <MaskProvider>
      <FyProvider>
        <DrawerProvider>
          <ShellMetaProvider>
            <div className="app-enter">
              <div className="app">
                <Sidebar />
                <div className="main">
                  <Topbar />
                  <div className="content" ref={contentRef}>
                    {children}
                  </div>
                </div>
              </div>
            </div>
          </ShellMetaProvider>
        </DrawerProvider>
      </FyProvider>
    </MaskProvider>
  );
}
