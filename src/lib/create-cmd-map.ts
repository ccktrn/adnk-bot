import { SlashCmd } from "../type";
import { readdirSync } from "fs";
import { join } from "path";


// find cmds in the cmds directory
async function createCmdMap(): Promise<Map<string, SlashCmd>> {
  const cmdMap = new Map<string, SlashCmd>();

  const cmdFiles = readdirSync(join(process.cwd(), 'src/cmds')).filter(file => file.endsWith('.ts') || file.endsWith('.js'));

  for (const file of cmdFiles) {
    const module = await import(`../cmds/${file}`);
    const cmd = module.default as SlashCmd;
    if (cmd && cmd.builder && typeof cmd.execute === "function") {
      cmdMap.set(cmd.builder.name, cmd);
    } else {
      console.warn(`Command in file ${file} is missing 'builder' or 'execute' properties.`);
    }
  }
  return cmdMap;
}

export default createCmdMap;