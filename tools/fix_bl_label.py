"""Fix blacklist level 1 display text"""
path = "/root/TransForDiscord/tfd-system/core/message-handler-v2.js"
with open(path, "r", encoding="utf-8") as f:
    c = f.read()

old1 = "`⚠️ 此作者有 [提示] 標記：${label} | ${existingFooter}`"
new1 = "`⚠️ ${label} | ${existingFooter}`"

old2 = "`⚠️ 此作者在本伺服器有 [提示] 等級標記：${label}`"
new2 = "`⚠️ ${label}`"

c = c.replace(old1, new1)
c = c.replace(old2, new2)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("Fixed level 1 display text")
