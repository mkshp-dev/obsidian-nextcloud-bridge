# Obsidian Nextcloud Bridge

Connects your Obsidian vault to your Nextcloud instance via WebDAV, allowing you to list and view files directly within your notes.

## Setup Guide

### 1. Nextcloud Configuration (App Password)
For security, it is highly recommended to use an **App Password** instead of your main login password. This allows you to revoke access for this specific plugin at any time without changing your main password.

1.  Log in to your Nextcloud web interface.
2.  Click on your user icon in the top right corner and select **Personal settings**.
3.  In the left sidebar, click on **Security**.
4.  Scroll down to the **Devices & sessions** section.
5.  In the text box at the bottom of the list, enter a name for this app (e.g., "Obsidian Bridge").
6.  Click **Create new app password**.
7.  **Copy the generated password immediately**. You will not be able to see it again.
8.  Click **Done**.

### 2. Plugin Configuration
1.  Open Obsidian **Settings** > **Nextcloud Bridge**.
2.  **Nextcloud URL**: Enter the full WebDAV URL.
    *   Usually found in Nextcloud under *Files* > *Settings* (bottom left) > *WebDAV*.
    *   Format: `https://your-cloud.com/remote.php/dav/files/your-username/`
3.  **Username**: Your Nextcloud username.
4.  **Password**: Paste the **App Password** you generated in step 1.
5.  Click **Test Connection** to verify everything is working.

## Usage

Use the `nextcloud` code block to list files from a specific folder.

### Basic Example
```nextcloud
command: List Files
folder: Documents/ProjectX
```

### Advanced Features

#### Filtering
Filter files using various criteria:

**File type filters:**
- `extension`: Filter by file extensions (comma-separated)
- `type`: Filter by resource type (`file` or `folder`)
- `mimetype`: Filter by MIME type (comma-separated, e.g., `image/jpeg, image/png`)

**Size filters:**
- `minsize`: Minimum file size in bytes
- `maxsize`: Maximum file size in bytes

**Date filters:**
- `modifiedafter`: Show files modified after a specific date/time
  - Absolute: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`
  - Relative: `now`, `now - 10 days`, `now + 2 hours`
  - Date arithmetic: `2025-10-10 - 10 days`, `2025-12-01T09:00:00 + 5 hours`
  - Supported units: `second`, `minute`, `hour`, `day`, `week`, `month`, `year` (singular or plural)
- `modifiedbefore`: Show files modified before a specific date/time (same formats as `modifiedafter`)

**Metadata filters:**
- `favorite`: Filter by favorite status (`true` or `1` for favorites only)
- `tag`: Filter by tags (comma-separated, matches any tag containing the filter text)
- `owner`: Filter by owner display name (partial match, case-insensitive)
- `haspreview`: Filter by preview availability (`true` or `1`)

**Examples:**

Filter by extension:
```nextcloud
command: List Files
folder: Photos
filter:
    - extension: jpg, png
```

Filter by size and type:
```nextcloud
command: List Files
folder: Documents
filter:
    - type: file
    - minsize: 1000000
    - maxsize: 10000000
```

Filter by date and favorite status:
```nextcloud
command: List Files
folder: Projects
filter:
    - favorite: true
    - modifiedafter: 2024-01-01
```

Filter by date with time:
```nextcloud
command: List Files
folder: Documents
filter:
    - modifiedafter: 2024-12-10T09:00:00
    - modifiedbefore: 2024-12-10T17:00:00
```

Filter by relative dates (files from last 10 days):
```nextcloud
command: List Files
folder: Documents
filter:
    - modifiedafter: now - 10 days
```

Filter by recent files (last 2 hours):
```nextcloud
command: List Files
folder: Work
filter:
    - modifiedafter: now - 2 hours
    - type: file
format: 🕐 {{name}} - {{datetime}}
```

Filter using date arithmetic on absolute dates:
```nextcloud
command: List Files
folder: Archive
filter:
    - modifiedafter: 2025-10-10 - 10 days
    - modifiedbefore: 2025-10-10 + 5 days
```

Filter by tags and MIME type:
```nextcloud
command: List Files
folder: Media
filter:
    - tag: work, important
    - mimetype: image/jpeg, image/png
```

#### Custom Formatting
Customize how each file entry is displayed using placeholders.

**Basic placeholders:**
- `{{name}}`: Full filename (e.g., `image.jpg`)
- `{{filename}}`: Filename without extension (e.g., `image`)
- `{{ext}}`: File extension (e.g., `jpg`)
- `{{path}}`: Full path to the file (e.g., `/Documents/Photos/image.jpg`)

**File metadata:**
- `{{size}}`: File size in bytes
- `{{sizekb}}`: File size in kilobytes (formatted with 2 decimals)
- `{{sizemb}}`: File size in megabytes (formatted with 2 decimals)
- `{{type}}`: Resource type (`file` or `folder`)
- `{{mimetype}}`: MIME type (e.g., `image/jpeg`, `application/pdf`)

**Date and time:**
- `{{date}}`: Last modified date (localized short format)
- `{{datetime}}`: Last modified date and time (localized format)
- `{{modified}}`: Raw last modified timestamp
- `{{created}}`: Creation date timestamp

**Additional metadata:**
- `{{favorite}}`: Shows ⭐ if file is marked as favorite, empty otherwise
- `{{tags}}`: Comma-separated list of tags
- `{{owner}}`: Display name of the file owner
- `{{fileid}}`: Unique file ID
- `{{preview}}`: Shows 📷 if file has a preview available, empty otherwise

```nextcloud
command: List Files
folder: Books
format: 📘 {{filename}} ({{sizemb}} MB) - Modified: {{date}}
```

#### UI Customization
Remove bullet points for a cleaner look.
```nextcloud
command: List Files
folder: Notes
list-style: none
```

### Combined Examples

Basic filtering with formatting:
```nextcloud
command: List Files
folder: Documents
filter:
    - extension: pdf
format: 📄 {{filename}}
list-style: none
```

Advanced filtering with metadata:
```nextcloud
command: List Files
folder: Work
filter:
    - type: file
    - favorite: true
    - modifiedafter: 2024-12-01
    - minsize: 1024
format: {{favorite}} {{name}} - {{sizemb}} MB ({{date}}) by {{owner}}
list-style: none
```

Show only images with previews and specific tags:
```nextcloud
command: List Files
folder: Gallery
filter:
    - mimetype: image/jpeg, image/png
    - haspreview: true
    - tag: vacation
format: {{preview}} {{filename}} {{tags}}
```

## Developer API

This plugin exposes a public API that other plugins can use to fetch files from Nextcloud.

### `runQuery(queryText: string): Promise<string[]>`

Executes a Nextcloud query string (same format as the code block) and returns an array of formatted strings.

**Example Usage:**

```typescript
const plugin = this.app.plugins.plugins["obsidian-nextcloud-bridge"];

if (plugin && plugin.api) {
    try {
        const results = await plugin.api.runQuery(`
            command: List Files
            folder: Photos
            filter:
                - extension: jpg
            format: {{filename}}
        `);
        
        console.log("Fetched files:", results);
    } catch (error) {
        console.error("Query failed:", error);
    }
}
```


## Support
If this project helps your workflow, consider supporting its development ☕

<a href="https://www.buymeacoffee.com/mkshp" target="_blank">
  <img
    src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=mkshp&button_colour=5F7FFF&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00"
    alt="Buy me a coffee"
    height="45"
  />
</a>