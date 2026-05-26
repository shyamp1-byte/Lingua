import Lottie from "lottie-react";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import avatarData from "../assets/avatar.json";

const greetings = [
  { text: "Hey there! I'm Lingua", lang: "English" },
  { text: "¡Hola! Soy Lingua", lang: "Español" },
  { text: "こんにちは！私はLinguaです", lang: "日本語" },
  { text: "Bonjour! Je suis Lingua", lang: "Français" },
  { text: "你好！我是Lingua", lang: "中文" },
];

const C = {
  surface:   "#1a1715",
  border:    "#2e2924",
  accent:    "#c8923a",
  text:      "#e8dcc8",
  textMuted: "#4a4438",
};

export function SpeakingAvatar() {
  const [current, setCurrent] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [typing, setTyping] = useState(true);
  const [resting, setResting] = useState(false);

  useEffect(() => {
    if (resting) return;
    const greeting = greetings[current];
    let i = 0;
    setDisplayText("");
    setTyping(true);

    const iv = setInterval(() => {
      if (i < greeting.text.length) {
        setDisplayText(greeting.text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(iv);
        setTyping(false);
        setTimeout(() => {
          setTimeout(() => {
            if (current < greetings.length - 1) {
              setCurrent((c) => c + 1);
            } else {
              setResting(true);
            }
          }, 350);
        }, 900);
      }
    }, 42);

    return () => clearInterval(iv);
  }, [current, resting]);

  return (
    // Row layout: bubble left, characters right — no overlap with elements above
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 10 }}>

      {/* Speech bubble on the left, tail points right toward characters */}
      <AnimatePresence>
        {!resting && (
          <motion.div
            style={{ position: "relative", maxWidth: 180 }}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.75, ease: "easeOut" }}
          >
            {/* Tail pointing right */}
            <div style={{
              position: "absolute", right: -7, top: "calc(50% - 6px)",
              width: 12, height: 12,
              background: C.surface,
              borderTop: `1px solid ${C.border}`,
              borderRight: `1px solid ${C.border}`,
              transform: "rotate(45deg)",
            }} />
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: "10px 14px",
              minWidth: 130,
            }}>
              <AnimatePresence mode="wait">
                <motion.p
                  key={current}
                  style={{ fontSize: 12, fontWeight: 500, color: C.text, margin: 0 }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                >
                  {displayText}
                  {typing && (
                    <motion.span
                      style={{
                        display: "inline-block", width: 1.5, height: 13,
                        background: C.accent, marginLeft: 2, verticalAlign: "middle",
                      }}
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.7, repeat: Infinity }}
                    />
                  )}
                </motion.p>
              </AnimatePresence>
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, letterSpacing: 0.4 }}>
                {greetings[current].lang}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Characters on the right */}
      <motion.div
        animate={resting ? { y: [0, -3, 0] } : { y: 0 }}
        transition={resting
          ? { delay: 0.8, duration: 3.5, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.6, ease: "easeOut" }
        }
      >
        <Lottie
          animationData={avatarData}
          loop
          autoplay
          style={{ width: 220, height: 171 }}
          rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
        />
      </motion.div>
    </div>
  );
}
