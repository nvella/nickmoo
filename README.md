# NickMOO

NickMOO in it's simplest terms is an online text game where a major gameplay element is reprogramming and adding content to the game while you are playing it. This is historically known as MOO (MUD-Object-Oriented), which is a descendant of the MUD genre. In terms of originality, NickMOO doesn't introduce any new concepts to the MOO genre, it's simply my interpretation and implementation of the genre. Because of this, NickMOO is incompatible with all current MOO implementations, most notably LambdaMOO.

NickMOO is built with NodeJS and MongoDB.

## Project status

- [x] TCP server
- [x] Connection management
- [x] Welcome message
- [ ] NML
 - [ ] Script Parser (in progress - 80% complete)
 - [ ] VM
- [ ] Objects
 - [ ] Javascript->DB mapping
- [ ] Player handling

*to be expanded*

## NML

At the core of any MOO is an in-game scripting language and at the core of NickMOO is a custom language called NML, or the NickMOO Language.

I chose to create a custom language instead of sandboxing Javascript or Lua as I wanted to have a common language for both player control and object scripting. NML is a very informal language where most structure is optional.

For example, to send a message to the chat, a player could write

    say Hello World!

but if they were writing a script and wanted to implement more structure, they could write;

    say('Hello World!')

Documentation for NML is in the works.

## Contributing

Pull requests are welcome, but at the current stage in development, not much can be done without having a firm grasp on NickMOO's internal structure. Contribution documentation is coming soon!