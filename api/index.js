import { randomBytes } from "node:crypto";

// 环境变量配置
const KEY = process.env.PROXY_KEY || "sk-replit-2528d01b32";
const ANTHROPIC_KEY = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const ANTHROPIC_URL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1";

const rid = () => "chatcmpl-" + randomBytes(4).toString("hex");
const now = () => (Date.now() / 1000) | 0;

// Vercel 必须导出一个默认函数，不能使用 createServer
export default async function handler(req, res) {
    // 1. 跨域处理 (CORS)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") return res.status(204).end();

    // 2. 鉴权
    if (req.headers.authorization !== `Bearer ${KEY}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    // 3. Models 接口 (支持 /v1/models 和 /api/models)
    if (req.url.includes("/models")) {
        const models = [
            { id: "gpt-5.5", object: "model", created: now(), owned_by: "openai" },
            { id: "gpt-5.3-codex", object: "model", created: now(), owned_by: "openai" },
            { id: "claude-3-5-sonnet-20241022", object: "model", created: now(), owned_by: "anthropic" }
        ];
        return res.status(200).json({ object: "list", data: models });
    }

    // 4. Chat Completions 接口
    if (req.method === "POST" && req.url.includes("/chat/completions")) {
        try {
            const p = req.body; // Vercel 自动解析 JSON
            
            // 简单演示：全部转发给 Anthropic
            const response = await fetch(`${ANTHROPIC_URL}/messages`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "x-api-key": ANTHROPIC_KEY,
                    "anthropic-version": "2023-06-01"
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022", // 映射到实际模型
                    max_tokens: p.max_tokens || 4096,
                    messages: p.messages.filter(m => m.role !== 'system'),
                    system: p.messages.find(m => m.role === 'system')?.content
                }),
            });

            const data = await response.json();
            
            // 转换为 OpenAI 格式返回
            return res.status(200).json({
                id: rid(),
                object: "chat.completion",
                created: now(),
                model: p.model,
                choices: [{
                    index: 0,
                    message: { role: "assistant", content: data.content[0].text },
                    finish_reason: "stop"
                }]
            });
        } catch (e) {
            return res.status(502).json({ error: "Proxy Error: " + e.message });
        }
    }

    return res.status(404).json({ error: "Not Found", url: req.url });
}
