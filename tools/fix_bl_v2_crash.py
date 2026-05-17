"""
Fix blacklist V2 Container crash + add Level 1 V2 support + remove BL-DBG debug logs.

Bug: result.embed.data crashes when result.embed is undefined (V2 Container mode).
Fix 1: Remove all [BL-DBG] debug console.log lines (3 lines).
Fix 2: Add V2 Container support to Level 1 blacklist handling.
"""

path = "/root/TransForDiscord/tfd-system/core/message-handler-v2.js"

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# Step 1: Remove all [BL-DBG] debug lines
new_lines = []
removed_dbg = 0
for line in lines:
    if '[BL-DBG]' in line and 'console.log' in line:
        removed_dbg += 1
        continue
    new_lines.append(line)

print(f"Removed {removed_dbg} [BL-DBG] debug lines")

# Step 2: Replace Level 1 block to add V2 Container support
old_level1 = """                        if (entry.level === 1) {
                            // Level 1: Warning footer
                            if (result.embed && typeof result.embed.setFooter === 'function') {
                                const label = entry.label || '未指定';
                                const existingFooter = result.embed.data?.footer?.text || '';
                                const warningText = existingFooter
                                    ? `⚠️ ${label} | ${existingFooter}`
                                    : `⚠️ ${label}`;
                                result.embed.setFooter({ text: warningText });
                            }
                        }"""

new_level1 = """                        if (entry.level === 1) {
                            // Level 1: Warning footer
                            const label = entry.label || '未指定';

                            // V2 Container: append warning TextDisplay
                            if (result.isV2 && result.v2Container) {
                                try {
                                    result.v2Container.addTextDisplayComponents(
                                        new TextDisplayBuilder().setContent(`⚠️ ${label}`)
                                    );
                                } catch (e) {
                                    this.log(`V2 Level 1 警告失敗: ${e.message}`, 'error');
                                }
                            }

                            // Traditional embed
                            if (result.embed && typeof result.embed.setFooter === 'function') {
                                const existingFooter = result.embed.data?.footer?.text || '';
                                const warningText = existingFooter
                                    ? `⚠️ ${label} | ${existingFooter}`
                                    : `⚠️ ${label}`;
                                result.embed.setFooter({ text: warningText });
                            }
                        }"""

content = ''.join(new_lines)
if old_level1 in content:
    content = content.replace(old_level1, new_level1)
    print("Level 1: Added V2 Container support")
else:
    print("WARNING: Level 1 block not found! Manual fix needed.")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Done! message-handler-v2.js patched.")
