import { motion, AnimatePresence } from "framer-motion";
import { MeshGradient } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";

const WORDS = [
  { text: "Lingua", sub: "Latin",    size: 94  },
  { text: "语言",   sub: "中文",     size: 110 },
  { text: "Langue", sub: "Français", size: 94  },
];

export function Intro({ onComplete }: { onComplete: () => void }) {
  const [wordIndex, setWordIndex] = useState(0);
  const [exiting, setExiting]     = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setWordIndex(1), 2600);
    const t2 = setTimeout(() => setWordIndex(2), 5200);
    const t3 = setTimeout(() => setExiting(true), 7000);
    const t4 = setTimeout(() => onComplete(),     7800);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [onComplete]);

  return (
    <motion.div
      style={{ position: "fixed", inset: 0, zIndex: 9999, overflow: "hidden" }}
      animate={exiting ? { opacity: 0, scale: 1.06 } : { opacity: 1, scale: 1 }}
      transition={exiting ? { duration: 0.8, ease: [0.4, 0, 0.2, 1] } : { duration: 0 }}
    >
      {/* MeshGradient background — amber/rust/dark palette, slow flowing */}
      <MeshGradient
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        colors={["#070604", "#1a0e05", "#c8923a", "#934535"]}
        speed={0.4}
      />

      {/* Crisp gradient text overlay */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column",
        pointerEvents: "none",
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={wordIndex}
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0  }}
            exit=   {{ opacity: 0, y: -20 }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            style={{ textAlign: "center" }}
          >
            <div style={{
              fontFamily: "'Dancing Script', Georgia, serif",
              fontSize:   WORDS[wordIndex].size,
              fontWeight: 700,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              padding:    "16px 40px",
              background: "linear-gradient(148deg, #fff8ee 0%, #e8c97a 18%, #ffffff 34%, #c8923a 52%, #f5e0a0 70%, #c8923a 84%, #9a6e28 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor:  "transparent",
              backgroundClip:       "text",
            }}>
              {WORDS[wordIndex].text}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              style={{
                color:         "rgba(160,135,95,0.6)",
                fontSize:      10,
                letterSpacing: 5,
                textTransform: "uppercase",
                marginTop:     20,
                fontFamily:    "system-ui, sans-serif",
              }}
            >
              {WORDS[wordIndex].sub}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
