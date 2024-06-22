#!/usr/bin/env python3

"""

I have a 'new_translations.json' file with English translation, please add entries for:
ar el es he id ja nl pt ru uk zh-TW zh-CN de fr hi it ko pl ro sv

{
  "en": {
    "translation": {
        "example": {
            "hello": "Hello",
            "comment-colors": "Print each letter with a different color",
            "comment-count": "Count 1 to 10"
        },
        "settings": {
            "zoom": "Zoom"
        }
    }
  }
}

"""

import os, json

def deep_update(original, updates):
    for key, value in updates.items():
        if isinstance(value, dict):
            original[key] = deep_update(original.get(key, {}), value)
        else:
            original[key] = value
    return original

def update_translations(input_file, target_folder):
    # Read the input file with new translations
    with open(input_file, 'r', encoding='utf-8') as f:
        new_translations = json.load(f)

    # Iterate over each language in the input file
    for lang, data in new_translations.items():
        target_file = os.path.join(target_folder, f"{lang}.json")

        # Check if the target file exists
        if os.path.exists(target_file):
            # Read the target file
            with open(target_file, 'r', encoding='utf-8') as f:
                target_data = json.load(f)

            # Update the target file with new translations
            target_data = deep_update(target_data, data)

            # Write the updated translations back to the target file
            with open(target_file, 'w', encoding='utf-8') as f:
                json.dump(target_data, f, ensure_ascii=False, indent=4)
        else:
            print(f"Target file {target_file} does not exist.")

if __name__ == "__main__":
    # Path to the input file containing new translations
    input_file = 'new_translations.json'

    # Folder containing the target JSON files
    target_folder = '.'

    update_translations(input_file, target_folder)
