"use client";

import { useEffect, useRef, useState } from "react";

interface LeafletMapProps {
  lat: number;
  lng: number;
  label: string;
}

function LeafletMap({ lat, lng, label }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if assets are already loading or loaded
    let cssLink = document.getElementById("leaflet-cdn-css") as HTMLLinkElement;
    if (!cssLink) {
      cssLink = document.createElement("link");
      cssLink.id = "leaflet-cdn-css";
      cssLink.rel = "stylesheet";
      cssLink.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(cssLink);
    }

    let jsScript = document.getElementById("leaflet-cdn-js") as HTMLScriptElement;
    if (!jsScript) {
      jsScript = document.createElement("script");
      jsScript.id = "leaflet-cdn-js";
      jsScript.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      document.head.appendChild(jsScript);
    }

    const checkLeaflet = () => {
      if ((window as any).L) {
        setIsLoaded(true);
      } else {
        setTimeout(checkLeaflet, 100);
      }
    };

    if (jsScript.onload) {
      checkLeaflet();
    } else {
      jsScript.addEventListener("load", () => {
        setIsLoaded(true);
      });
      checkLeaflet();
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !containerRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Destroy existing map instance if it exists
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    try {
      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: false,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20
      }).addTo(map);

      // Modern pulsing marker
      const customIcon = L.divIcon({
        className: "custom-map-marker",
        html: `
          <div class="relative flex items-center justify-center">
            <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-pink-500 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-pink-600 border border-white"></span>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);
      marker.bindPopup(`<strong class="text-crust">${label}</strong>`).openPopup();

      mapInstanceRef.current = map;

      // Leaflet viewport adjustment
      setTimeout(() => {
        map.invalidateSize();
      }, 250);

    } catch (e) {
      console.error("Leaflet map initialization failed:", e);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isLoaded, lat, lng, label]);

  return (
    <div className="w-full my-4 relative">
      <div 
        ref={containerRef} 
        className="w-full h-64 rounded-3xl overflow-hidden border border-surface/50 shadow-md bg-crust/50 z-10" 
      />
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-crust/80 rounded-3xl border border-surface/50">
          <div className="flex flex-col items-center gap-2">
            <span className="animate-spin rounded-full h-6 w-6 border-b-2 border-hype"></span>
            <span className="text-[10px] text-overlay">Loading Leaflet Map...</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatItalic(text: string): React.ReactNode[] {
  const italicParts = text.split(/(\*.*?\*)/g);
  return italicParts.map((part, iIdx) => {
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={`i-${iIdx}`} className="italic text-text/90">{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

function formatInline(text: string): React.ReactNode[] {
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  const result: React.ReactNode[] = [];

  boldParts.forEach((part, bIdx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const innerText = part.slice(2, -2);
      result.push(
        <strong key={`b-${bIdx}`} className="font-bold text-hype">
          {formatItalic(innerText)}
        </strong>
      );
    } else {
      result.push(...formatItalic(part));
    }
  });

  return result;
}

function renderMarkdownBlocks(text: string) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentParagraph: string[] = [];
  let currentList: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="mb-4 text-md text-text/95 leading-relaxed">
          {formatInline(currentParagraph.join(" "))}
        </p>
      );
      currentParagraph = [];
    }
  };

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-6 mb-4 space-y-1.5 text-md text-text/95">
          {currentList.map((item, idx) => (
            <li key={idx}>{formatInline(item)}</li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }

    if (line === "---") {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-t border-surface/50 my-6" />);
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="text-2xl font-extrabold text-text mt-6 mb-3">
          {formatInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="text-xl font-bold text-text mt-5 mb-2.5">
          {formatInline(line.slice(3))}
        </h2>
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="text-lg font-bold text-text mt-4 mb-2">
          {formatInline(line.slice(4))}
        </h3>
      );
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      currentList.push(line.slice(2));
      continue;
    }

    // Normal line - add to current paragraph
    flushList();
    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();

  return <div className="flex flex-col">{blocks}</div>;
}

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  if (!content) return null;

  // Split by map token [map: lat, lng, label]
  const parts = content.split(/(\[map:\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?(?:.*?\]))/gi);

  return (
    <div className="markdown-content">
      {parts.map((part, index) => {
        if (part.startsWith("[map:") && part.endsWith("]")) {
          const cleanToken = part.slice(5, -1);
          const subparts = cleanToken.split(",");
          const lat = parseFloat(subparts[0]?.trim() || "");
          const lng = parseFloat(subparts[1]?.trim() || "");
          const label = subparts.slice(2).join(",").trim() || "Location";

          if (!isNaN(lat) && !isNaN(lng)) {
            return (
              <LeafletMap key={index} lat={lat} lng={lng} label={label} />
            );
          }
          return (
            <div key={index} className="text-xs text-stressed italic my-2">
              Invalid map coordinates: {part}
            </div>
          );
        }

        return <div key={index}>{renderMarkdownBlocks(part)}</div>;
      })}
    </div>
  );
}
