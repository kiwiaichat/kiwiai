# KiwiAI 

A minimalistic AI roleplay platform inspired by [CharacterAI](https://character.ai/) and [JanitorAI](https://janitorai.com/).

---

Note: when setting up Kiwi, you'll need to add a `config.json` file to `/public/assets/js/`

It should look like so:

```json
{
    "bareClient": "your_bare"
}
```

and you must create a `config.json` file in the root of the project.

```json
{
    "webhook": "your_discord_webhook",
    "prefix": "your_prefix"
}
```

in order for reports to be sent to Discord ( for human evaluation ).

It requires a URL to a TompHTTP Bare server.

**Built with ❤️ by the [KiwiAI Team](https://github.com/kiwiaichat)**