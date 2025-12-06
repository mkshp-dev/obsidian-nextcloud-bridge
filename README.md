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

```nextcloud
command; List Files
folder: /Documents/ProjectX
```

- `folder`: The path to the folder in your Nextcloud (start with `/`). Defaults to root `/` if omitted.
