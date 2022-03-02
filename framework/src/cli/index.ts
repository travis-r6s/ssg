import { program, command } from 'bandersnatch'
import { name, version } from '../../package.json'

// Commands
import * as vite from './vite'

const info = command('info').description('CLI Information').action(() => {
  console.log(`${name}, version ${version}`)
})

const cliProgram = program().description('SSG CLI').default(info)

// Add command to program
Object.values(vite).forEach(cmd => cliProgram.add(cmd))

export default cliProgram.run()
  .catch((err) => {
    console.error(`There was a problem running this command:\n${String(err)}`)
    process.exit(1)
  })
