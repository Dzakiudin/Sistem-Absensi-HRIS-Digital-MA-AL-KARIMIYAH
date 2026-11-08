"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CommandPalette } from "@astryxdesign/core/CommandPalette";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { StackItem } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { themes, defaultThemeSlug } from "../src/astryx-themes";
import {
  astryxCommandSource,
  executeAstryxCommand,
  useAstryxGlobalShortcuts,
  useAstryxThemeSync,
  type AstryxCommandItem,
} from "../src/mountAppBody";

export function AppRoot({ children }: { children: ReactNode }) {
  const { mode, setMode } = useAstryxThemeSync();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openPalette = useCallback(() => {
    setIsPaletteOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  useAstryxGlobalShortcuts(openPalette, openSettings);

  const handleCommandSelect = useCallback(
    (value: string) => {
      setIsPaletteOpen(false);
      executeAstryxCommand(value, openSettings);
    },
    [openSettings],
  );

  const renderCommandItem = useCallback((item: AstryxCommandItem) => {
    return (
      <VStack gap={0.5}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Text type="label">{item.label}</Text>
          </StackItem>
          <Badge
            variant="neutral"
            label={item.auxiliaryData?.group ?? "Menu"}
          />
        </HStack>
        <Text type="supporting" color="secondary">
          {item.auxiliaryData?.description ?? ""}
        </Text>
      </VStack>
    );
  }, []);

  return (
    <Theme theme={themes[defaultThemeSlug]} mode={mode}>
      {children}
      <CommandPalette
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        searchSource={astryxCommandSource}
        onValueChange={handleCommandSelect}
        renderItem={renderCommandItem}
        label="Navigasi Cepat & Perintah Sistem"
        emptySearchText="Tidak ada menu atau perintah yang cocok."
        emptyBootstrapText="Ketik untuk mencari menu atau perintah..."
      />
      <Dialog
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        width={480}
        aria-label="Pengaturan Tampilan Astryx"
      >
        <Layout
          height="auto"
          header={
            <LayoutHeader hasDivider>
              <HStack gap={2} vAlign="center">
                <StackItem size="fill">
                  <Heading level={3}>Preferensi Tampilan Sistem</Heading>
                </StackItem>
                <Badge variant="teal" label="Astryx Neutral" />
              </HStack>
            </LayoutHeader>
          }
          content={
            <LayoutContent>
              <VStack gap={4}>
                <Card>
                  <VStack gap={3}>
                    <Switch
                      label="Mode Gelap (Dark Mode)"
                      description="Gunakan skema warna gelap ramah mata pada seluruh portal presensi."
                      value={mode === "dark"}
                      onChange={(checked) =>
                        setMode(checked ? "dark" : "light")
                      }
                      labelSpacing="spread"
                      width="100%"
                    />
                    <Divider />
                    <HStack gap={2} vAlign="center">
                      <StackItem size="fill">
                        <VStack gap={0.5}>
                          <Text type="label">Pencarian Cepat (Command Palette)</Text>
                          <Text type="supporting" color="secondary">
                            Tekan Ctrl+K atau Cmd+K kapan saja untuk berpindah menu.
                          </Text>
                        </VStack>
                      </StackItem>
                      <Button
                        label="Buka Pencarian"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setIsSettingsOpen(false);
                          setIsPaletteOpen(true);
                        }}
                      />
                    </HStack>
                  </VStack>
                </Card>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack gap={2} hAlign="end">
                <Button
                  label="Tutup"
                  variant="primary"
                  onClick={() => setIsSettingsOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </Theme>
  );
}
