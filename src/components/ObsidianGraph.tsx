"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ZoomIn, ZoomOut, RotateCcw, Maximize2 } from "lucide-react";

interface Log {
  id: string;
  ai_title: string;
  ai_mood_color: string;
  ai_tags: string[];
  custom_tags: string[];
  created_at: string;
}

interface Node {
  id: string;
  label: string;
  type: "journal" | "category" | "tag";
  color: string;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  journalId?: string;
}

interface Link {
  source: string;
  target: string;
}

interface ObsidianGraphProps {
  logs: Log[];
}

export default function ObsidianGraph({ logs }: ObsidianGraphProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport states
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 800, height: 550 });

  // Stable physics params
  const charge = -150; // Repulsion force charge coefficient
  const gravity = 0.04; // Gravity pulling nodes to (0,0)
  const linkStrength = 0.04; // Attraction of links
  const friction = 0.85;

  // Interactivity states
  const dragNodeRef = useRef<Node | null>(null);
  const hoverNodeRef = useRef<Node | null>(null);
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Construct Nodes and Links dynamically
  const { nodes, links } = useMemo(() => {
    const nodeMap = new Map<string, Node>();
    const linkList: Link[] = [];
    const linkSet = new Set<string>();

    const addLink = (source: string, target: string) => {
      const key = `${source}->${target}`;
      const reverseKey = `${target}->${source}`;
      if (!linkSet.has(key) && !linkSet.has(reverseKey)) {
        linkSet.add(key);
        linkList.push({ source, target });
      }
    };

    logs.forEach((log) => {
      // Find category tag in custom_tags
      const categoryTag = log.custom_tags?.find((t) => t.startsWith("_category:"));
      const categoryName = categoryTag ? categoryTag.replace("_category:", "") : "General";
      const categoryId = `cat:${categoryName.toLowerCase()}`;

      // Create category node if not exists
      if (!nodeMap.has(categoryId)) {
        nodeMap.set(categoryId, {
          id: categoryId,
          label: categoryName,
          type: "category",
          color: "#cba6f7", // mauve
          radius: 12,
          x: (Math.random() - 0.5) * 60,
          y: (Math.random() - 0.5) * 60,
          vx: 0,
          vy: 0,
        });
      }

      // Create journal node
      const journalId = `journal:${log.id}`;
      nodeMap.set(journalId, {
        id: journalId,
        label: log.ai_title || "Untitled Entry",
        type: "journal",
        color: log.ai_mood_color || "#74c7ec",
        radius: 7,
        x: (Math.random() - 0.5) * 60,
        y: (Math.random() - 0.5) * 60,
        vx: 0,
        vy: 0,
        journalId: log.id,
      });

      // Link Journal to Category
      addLink(journalId, categoryId);

      // Create Tag nodes and link them
      if (log.ai_tags && Array.isArray(log.ai_tags)) {
        log.ai_tags.forEach((tag) => {
          const tagId = `tag:${tag.toLowerCase()}`;
          if (!nodeMap.has(tagId)) {
            nodeMap.set(tagId, {
              id: tagId,
              label: `#${tag}`,
              type: "tag",
              color: "#a6e3a1", // green
              radius: 8,
              x: (Math.random() - 0.5) * 60,
              y: (Math.random() - 0.5) * 60,
              vx: 0,
              vy: 0,
            });
          }

          // Link Journal to Tag
          addLink(journalId, tagId);

          // Link Tag to Category to show broad hierarchy
          addLink(tagId, categoryId);
        });
      }
    });

    return {
      nodes: Array.from(nodeMap.values()),
      links: linkList,
    };
  }, [logs]);

  // Keep a mutable ref of nodes for the canvas physics loop
  const nodesRef = useRef<Node[]>([]);
  useEffect(() => {
    // Keep positions stable when logs change, only add new nodes
    const prevMap = new Map(nodesRef.current.map((n) => [n.id, n]));
    nodesRef.current = nodes.map((node) => {
      const prev = prevMap.get(node.id);
      if (prev) {
        return {
          ...node,
          x: prev.x,
          y: prev.y,
          vx: prev.vx,
          vy: prev.vy,
          fx: prev.fx,
          fy: prev.fy,
        };
      }
      return node;
    });
  }, [nodes]);

  // Handle Resize
  useEffect(() => {
    if (!containerRef.current) return;
    const updateDimensions = () => {
      const width = containerRef.current?.clientWidth || 800;
      const height = 550;
      setDimensions({ width, height });
      
      // Center the graph viewport initially
      setPanX(width / 2);
      setPanY(height / 2);
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Physics and Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const tick = () => {
      const currentNodes = nodesRef.current;

      // 1. Reset forces
      const fx = new Array(currentNodes.length).fill(0);
      const fy = new Array(currentNodes.length).fill(0);

      // 2. Repulsion force between all nodes (Coulomb-like repulsion, bounded to prevent explosions)
      for (let i = 0; i < currentNodes.length; i++) {
        const nodeA = currentNodes[i];
        for (let j = i + 1; j < currentNodes.length; j++) {
          const nodeB = currentNodes[j];
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const distSq = dx * dx + dy * dy + 1.0; // minimum offset
          const dist = Math.sqrt(distSq);

          if (dist < 280) {
            // Adding 15.0 to denominator bounds the force so it doesn't approach infinity at distance -> 0
            const force = (charge * nodeA.radius * nodeB.radius) / (distSq + 15.0);
            const fX = (dx / dist) * force;
            const fY = (dy / dist) * force;

            fx[i] += fX;
            fy[i] += fY;
            fx[j] -= fX;
            fy[j] -= fY;
          }
        }
      }

      // 3. Link Attraction forces
      links.forEach((link) => {
        const sourceNodeIdx = currentNodes.findIndex((n) => n.id === link.source);
        const targetNodeIdx = currentNodes.findIndex((n) => n.id === link.target);

        if (sourceNodeIdx !== -1 && targetNodeIdx !== -1) {
          const sNode = currentNodes[sourceNodeIdx];
          const tNode = currentNodes[targetNodeIdx];

          const dx = tNode.x - sNode.x;
          const dy = tNode.y - sNode.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

          const targetDist = 65;
          const force = (dist - targetDist) * linkStrength;
          const fX = (dx / dist) * force;
          const fY = (dy / dist) * force;

          fx[sourceNodeIdx] += fX;
          fy[sourceNodeIdx] += fY;
          fnTarget(targetNodeIdx, fX, fY);
        }
      });

      function fnTarget(targetIdx: number, fX: number, fY: number) {
        fx[targetIdx] -= fX;
        fy[targetIdx] -= fY;
      }

      // 4. Gravity towards the origin (0, 0)
      for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];
        fx[i] -= node.x * gravity;
        fy[i] -= node.y * gravity;
      }

      // 5. Update velocities and positions with strict velocity clamping and center bounding constraint
      const maxVelocity = 4.5;
      const maxRadius = 350; // Keep nodes within a 350px radius from the center (0, 0)
      for (let i = 0; i < currentNodes.length; i++) {
        const node = currentNodes[i];

        if (node.fx !== undefined && node.fx !== null) {
          node.x = node.fx;
          node.vx = 0;
        } else {
          node.vx = (node.vx + fx[i]) * friction;
          // Clamp velocity
          node.vx = Math.max(-maxVelocity, Math.min(node.vx, maxVelocity));
          node.x += node.vx;
        }

        if (node.fy !== undefined && node.fy !== null) {
          node.y = node.fy;
          node.vy = 0;
        } else {
          node.vy = (node.vy + fy[i]) * friction;
          // Clamp velocity
          node.vy = Math.max(-maxVelocity, Math.min(node.vy, maxVelocity));
          node.y += node.vy;
        }

        // Apply bounding circle constraint
        const distFromCenter = Math.sqrt(node.x * node.x + node.y * node.y);
        if (distFromCenter > maxRadius) {
          node.x = (node.x / distFromCenter) * maxRadius;
          node.y = (node.y / distFromCenter) * maxRadius;
          node.vx *= -0.2; // slight bounce factor back to center
          node.vy *= -0.2;
        }
      }

      // 6. Draw graph
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      // Grid lines
      ctx.strokeStyle = "rgba(49, 50, 68, 0.15)";
      ctx.lineWidth = 1;
      const gridSize = 70;
      const startX = Math.floor((-panX / scale) / gridSize) * gridSize;
      const endX = startX + (dimensions.width / scale) + gridSize * 2;
      const startY = Math.floor((-panY / scale) / gridSize) * gridSize;
      const endY = startY + (dimensions.height / scale) + gridSize * 2;

      for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x, endY);
        ctx.stroke();
      }
      for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(endX, y);
        ctx.stroke();
      }

      // Hover highlight states
      const activeNode = hoverNodeRef.current;
      const connectedNodeIds = new Set<string>();
      if (activeNode) {
        connectedNodeIds.add(activeNode.id);
        links.forEach((l) => {
          if (l.source === activeNode.id) connectedNodeIds.add(l.target);
          if (l.target === activeNode.id) connectedNodeIds.add(l.source);
        });
      }

      // Draw Links
      links.forEach((link) => {
        const sourceNode = currentNodes.find((n) => n.id === link.source);
        const targetNode = currentNodes.find((n) => n.id === link.target);

        if (sourceNode && targetNode) {
          const isHighlighted = activeNode ? (connectedNodeIds.has(sourceNode.id) && connectedNodeIds.has(targetNode.id)) : false;
          
          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y);
          ctx.lineTo(targetNode.x, targetNode.y);
          
          if (activeNode) {
            ctx.strokeStyle = isHighlighted ? "rgba(116, 199, 236, 0.5)" : "rgba(49, 50, 68, 0.05)";
            ctx.lineWidth = isHighlighted ? 1.5 : 0.4;
          } else {
            ctx.strokeStyle = "rgba(76, 79, 105, 0.2)";
            ctx.lineWidth = 0.6;
          }
          ctx.stroke();
        }
      });

      // Draw Nodes
      currentNodes.forEach((node) => {
        const isSelf = activeNode?.id === node.id;
        const isNeighbor = activeNode ? connectedNodeIds.has(node.id) : false;
        const isDimmed = activeNode && !isSelf && !isNeighbor;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        
        ctx.fillStyle = node.color;
        ctx.globalAlpha = isDimmed ? 0.15 : 1.0;
        ctx.fill();

        ctx.strokeStyle = isSelf ? "#ffffff" : "rgba(17, 17, 27, 0.7)";
        ctx.lineWidth = isSelf ? 1.75 : 0.75;
        ctx.stroke();

        const showLabel = !isDimmed || isSelf || isNeighbor;
        if (showLabel) {
          ctx.fillStyle = isSelf ? "#f5c2e7" : "#cdd6f4";
          ctx.font = isSelf ? "bold 10px Inter, sans-serif" : "9px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(node.label, node.x, node.y + node.radius + 3);
        }

        ctx.globalAlpha = 1.0;
      });

      ctx.restore();

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [links, panX, panY, scale, dimensions, charge, gravity, linkStrength]);

  // Coordinates transforms
  const screenToWorld = (sx: number, sy: number) => {
    return {
      x: (sx - panX) / scale,
      y: (sy - panY) / scale,
    };
  };

  const getEventCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  // Mouse Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const screenCoords = getEventCoordinates(e);
    const worldCoords = screenToWorld(screenCoords.x, screenCoords.y);

    if (dragNodeRef.current) {
      dragNodeRef.current.fx = worldCoords.x;
      dragNodeRef.current.fy = worldCoords.y;
      return;
    }

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanX((prev) => prev + dx);
      setPanY((prev) => prev + dy);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const hitNode = nodesRef.current.find((node) => {
      const dx = node.x - worldCoords.x;
      const dy = node.y - worldCoords.y;
      return Math.sqrt(dx * dx + dy * dy) <= node.radius + 6;
    });

    hoverNodeRef.current = hitNode || null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const screenCoords = getEventCoordinates(e);
    const worldCoords = screenToWorld(screenCoords.x, screenCoords.y);

    const hitNode = nodesRef.current.find((node) => {
      const dx = node.x - worldCoords.x;
      const dy = node.y - worldCoords.y;
      return Math.sqrt(dx * dx + dy * dy) <= node.radius + 6;
    });

    if (hitNode) {
      dragNodeRef.current = hitNode;
      hitNode.fx = hitNode.x;
      hitNode.fy = hitNode.y;
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.fx = null;
      dragNodeRef.current.fy = null;
      dragNodeRef.current = null;
    }
    isPanningRef.current = false;
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const screenCoords = getEventCoordinates(e);
    const worldCoords = screenToWorld(screenCoords.x, screenCoords.y);

    const hitNode = nodesRef.current.find((node) => {
      const dx = node.x - worldCoords.x;
      const dy = node.y - worldCoords.y;
      return Math.sqrt(dx * dx + dy * dy) <= node.radius + 6;
    });

    if (hitNode && hitNode.type === "journal" && hitNode.journalId) {
      router.push(`/journal/${hitNode.journalId}`);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
    setScale(Math.max(0.25, Math.min(newScale, 3.0)));
  };

  const zoomIn = () => setScale((prev) => Math.min(prev * 1.2, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev / 1.2, 0.25));
  const resetViewport = () => {
    setScale(1);
    setPanX(dimensions.width / 2);
    setPanY(dimensions.height / 2);
  };
  const triggerRecenter = () => {
    if (nodesRef.current.length === 0) return;
    let avgX = 0;
    let avgY = 0;
    nodesRef.current.forEach((n) => {
      avgX += n.x;
      avgY += n.y;
    });
    avgX /= nodesRef.current.length;
    avgY /= nodesRef.current.length;

    setPanX(dimensions.width / 2 - avgX * scale);
    setPanY(dimensions.height / 2 - avgY * scale);
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full rounded-3xl glass-panel relative overflow-hidden flex flex-col border border-surface/50 select-none shadow-lg"
    >
      {/* HUD Info */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 pointer-events-none">
        <span className="text-[10px] text-overlay uppercase tracking-wider font-bold">
          Mind Network View
        </span>
        <span className="text-xs text-text font-bold">
          {logs.length} Entry Graph
        </span>
        <span className="text-[9px] text-overlay font-light mt-1">
          • Double-click journal node to read details<br />
          • Click & drag nodes to pull connections<br />
          • Scroll wheel to Zoom, Drag background to Pan
        </span>
      </div>

      {/* Control Buttons */}
      <div className="absolute top-4 right-4 z-20 flex gap-1.5">
        <button
          onClick={zoomIn}
          className="p-2 rounded-xl bg-crust/85 border border-surface hover:text-hype text-text cursor-pointer transition-colors shadow-md backdrop-blur-sm"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={zoomOut}
          className="p-2 rounded-xl bg-crust/85 border border-surface hover:text-hype text-text cursor-pointer transition-colors shadow-md backdrop-blur-sm"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={triggerRecenter}
          className="p-2 rounded-xl bg-crust/85 border border-surface hover:text-hype text-text cursor-pointer transition-colors shadow-md backdrop-blur-sm"
          title="Recenter"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={resetViewport}
          className="p-2 rounded-xl bg-crust/85 border border-surface hover:text-hype text-text cursor-pointer transition-colors shadow-md backdrop-blur-sm"
          title="Reset Viewport"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Legend Indicators */}
      <div className="absolute bottom-4 left-4 z-20 flex gap-4 bg-crust/70 px-3.5 py-2 rounded-2xl border border-surface/50 backdrop-blur-sm pointer-events-none">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#cba6f7]" />
          <span className="text-overlay font-medium">Categories</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#a6e3a1]" />
          <span className="text-overlay font-medium">Specific Tags</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#74c7ec]" />
          <span className="text-overlay font-medium">Journals</span>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        className="w-full bg-[rgba(17,17,27,0.25)] cursor-grab active:cursor-grabbing block"
      />
    </div>
  );
}
