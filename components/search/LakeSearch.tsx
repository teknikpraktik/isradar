"use client";

import { useId, useMemo, useRef, useState } from "react";
import { normalizeForSearch } from "@/lib/format";
import type { LakeIndexEntry, TemperatureStation } from "@/types/lake";
import styles from "./LakeSearch.module.css";

interface Props {
  index: LakeIndexEntry[];
  stations: Map<number, TemperatureStation>;
  onPick: (lake: LakeIndexEntry) => void;
  disabled?: boolean;
}

const MAX_RESULTS = 20;

export default function LakeSearch({ index, stations, onPick, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const normalized = useMemo(
    () => index.map((l) => ({ lake: l, key: normalizeForSearch(l.name) })),
    [index],
  );

  const results = useMemo(() => {
    const q = normalizeForSearch(query);
    if (q.length < 2) return [];
    const starts: LakeIndexEntry[] = [];
    const contains: LakeIndexEntry[] = [];
    for (const { lake, key } of normalized) {
      if (key.startsWith(q)) starts.push(lake);
      else if (key.includes(q)) contains.push(lake);
    }
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [query, normalized]);

  const pick = (lake: LakeIndexEntry) => {
    onPick(lake);
    setQuery(lake.name);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showList = open && query.trim().length >= 2;

  return (
    <div className={styles.search}>
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        placeholder={disabled ? "Laddar vatten…" : "Sök vatten"}
        disabled={disabled}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Sök vatten efter namn"
        autoComplete="off"
        spellCheck={false}
      />
      {showList && (
        <ul id={listId} role="listbox" className={styles.list}>
          {results.length === 0 && <li className={styles.empty}>Inga träffar</li>}
          {results.map((lake, i) => {
            const station = lake.stationId !== null ? stations.get(lake.stationId) : undefined;
            return (
              <li
                key={lake.id}
                role="option"
                aria-selected={i === active}
                className={i === active ? styles.active : undefined}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(lake)}
                onMouseEnter={() => setActive(i)}
              >
                <span className={styles.name}>{lake.name}</span>
                <span className={styles.meta}>
                  <span className="num">
                    {lake.centroid[1].toFixed(2)}° N {lake.centroid[0].toFixed(2)}° E
                  </span>
                  {station && <span> · {station.name}</span>}
                  {lake.areaType === "COLLECTION_AREA" ? (
                    <span> · områdespolygon</span>
                  ) : (
                    lake.hca !== null && <span className="num"> · {lake.hca} GD</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
