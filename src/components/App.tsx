import { useRef } from 'react';
import { useSelectedDevice, useDevices } from '../hooks/useDevices';
import { useGlassRefraction } from '../hooks/useGlassRefraction';
import { useSpecularPointer } from '../hooks/useSpecularPointer';
import { LiquidGlassLayer } from '../glass/LiquidGlassLayer';
import { DeviceEditor } from './DeviceEditor';
import { HomePage } from './HomePage';
import { ThemeToggle } from './ThemeToggle';
import { ThemeSelector } from './ThemeSelector';
import { DeviceProvider } from '../context/DeviceContext';
import { ToastProvider } from '../context/ToastContext';
import type { ImageManifest } from '../utils/buildImageManifest';

interface AppProps {
  initialKeyboards?: Array<{ pid: string; name: string }>;
  imageManifest?: ImageManifest;
  ledManifest?: string;
}

function AppContent({ initialKeyboards, imageManifest }: AppProps = {}) {
  const device = useSelectedDevice();
  const { disconnectDevice } = useDevices();
  const refractRef = useRef<HTMLSpanElement>(null);

  // Liquid Glass: the header bends the wallpaper along its rim, and every
  // glass surface picks up a specular highlight that follows the pointer.
  useGlassRefraction(refractRef, { bezel: 24, strength: 14 });
  useSpecularPointer();

  return (
    <div className="min-h-screen">
      {/* Real Liquid DOM (WebGPU) glass; the CSS glass below is the fallback. */}
      <LiquidGlassLayer />

      {/* Fallback backdrop for the CSS glass: drifting colour blobs + a dot lattice */}
      <div className="lg-wallpaper" aria-hidden="true">
        <span className="lg-blob lg-blob-a" />
        <span className="lg-blob lg-blob-b" />
        <span className="lg-blob lg-blob-c" />
      </div>

      <div className="lg-sticky-top sticky top-3 z-40 px-3 sm:px-6 lg:px-8">
        <header className="lg-panel lg-header max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <span ref={refractRef} className="lg-refract" aria-hidden="true" />
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Title */}
            <div className="flex items-center gap-3">
              <span className="lg-tile lg-tile-primary flex size-10 items-center justify-center" aria-hidden="true">
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="4.5" />
                  <path d="M9.5 8.5v7M9.5 12l4.5-3.5M9.5 12l4.5 3.5" />
                </svg>
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Kludge Knight</h1>
            </div>

            {/* Theme controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="hidden md:inline text-sm text-muted-foreground">
                  Themes by <a href="https://tweakcn.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">tweakcn</a>:
                </span>
                <ThemeSelector />
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!device ? (
          <HomePage initialKeyboards={initialKeyboards} imageManifest={imageManifest} />
        ) : (
          <DeviceEditor
            key={device.id}
            device={device}
            imageManifest={imageManifest}
            onDisconnect={disconnectDevice}
          />
        )}
      </main>

      <footer className="px-3 sm:px-6 lg:px-8 mt-12 pb-6">
        <div className="lg-panel max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-center text-sm text-muted-foreground">
            Unofficial browser-based Royal Kludge software
          </p>
          <p className="text-center text-xs text-muted-foreground mt-2">
            <a
              href="https://github.com/vinc3m1/kludgeknight"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              View Source on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

// Wrap AppContent with ToastProvider and DeviceProvider
// ToastProvider must be outside DeviceProvider since DeviceProvider uses toast context
export default function App(props: AppProps) {
  return (
    <ToastProvider>
      <DeviceProvider ledManifest={props.ledManifest}>
        <AppContent {...props} />
      </DeviceProvider>
    </ToastProvider>
  );
}
