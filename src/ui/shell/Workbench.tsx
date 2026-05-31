'use client';
import { useEffect, useRef, useState } from 'react';
import { MaskProvider } from '../contexts/MaskCtx';
import { FyProvider } from '../contexts/FyCtx';
import { DrawerProvider } from '../contexts/DrawerCtx';
import { Sidebar, type WorkbenchPage } from './Sidebar';
import { Topbar } from './Topbar';
import { Overview } from '../pages/Overview';
import { Income } from '../pages/Income';
import { Expenses } from '../pages/Expenses';
import { Investments } from '../pages/Investments';
import { Liabilities } from '../pages/Liabilities';
import { Subscriptions } from '../pages/Subscriptions';
import { Tax } from '../pages/Tax';
import { Review } from '../pages/Review';
import { Sources } from '../pages/Sources';
import { Profile } from '../pages/Profile';
import { Settings } from '../pages/Settings';

function WorkbenchShell({ initialPage }: { initialPage: WorkbenchPage }) {
  const [page, setPage] = useState<WorkbenchPage>(initialPage);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [page]);

  const pages: Record<WorkbenchPage, React.ReactNode> = {
    overview: <Overview setPage={setPage} />,
    income: <Income />,
    expenses: <Expenses />,
    investments: <Investments />,
    liabilities: <Liabilities />,
    subscriptions: <Subscriptions />,
    tax: <Tax />,
    review: <Review />,
    sources: <Sources />,
    profile: <Profile />,
    settings: <Settings />,
  };

  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} />
      <div className="main">
        <Topbar />
        <div className="content" ref={contentRef}>
          {pages[page]}
        </div>
      </div>
    </div>
  );
}

export function Workbench({ initialPage = 'overview' }: { initialPage?: WorkbenchPage }) {
  return (
    <MaskProvider>
      <FyProvider>
        <DrawerProvider>
          <div className="app-enter">
            <WorkbenchShell initialPage={initialPage} />
          </div>
        </DrawerProvider>
      </FyProvider>
    </MaskProvider>
  );
}
