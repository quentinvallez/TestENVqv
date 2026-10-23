export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[13px] font-semibold text-primary-fg">V</span>
          <span className="text-[15px] font-semibold tracking-tight">Viewing</span>
        </div>
        {children}
      </div>
    </div>
  );
}
