"""Add temporary debug log to blacklist check in message-handler-v2.js"""

path = "/root/TransForDiscord/tfd-system/core/message-handler-v2.js"

# Restore from backup first
import shutil
shutil.copy(path + ".bak", path)

with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

DBG1 = '                    console.log("[BL-DBG] guild=" + message.guild.id + " platform=" + platform + " author=" + author + " uid=" + uid);\n'
DBG2 = '                    if (entry) console.log("[BL-DBG] MATCH! level=" + entry.level + " label=" + entry.label);\n'

new_lines = []
for line in lines:
    new_lines.append(line)
    if "normalizeAuthorForBlacklist(result, message)" in line and "const {" in line:
        new_lines.append(DBG1)
    if "gbm.check(message.guild.id, platform, author, uid)" in line and "const entry" in line:
        new_lines.append(DBG2)

with open(path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Added debug lines. Total lines: " + str(len(new_lines)))
